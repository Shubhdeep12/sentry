import logging
from typing import ClassVar, cast

import rb
from django.conf import settings
from django.db import IntegrityError, models, router, transaction
from django.utils import timezone
from rediscluster import RedisCluster

from sentry.adoption import manager
from sentry.adoption.manager import UnknownFeature
from sentry.backup.scopes import RelocationScope
from sentry.db.models import FlexibleForeignKey, JSONField, Model, region_silo_model, sane_repr
from sentry.db.models.manager.base import BaseManager
from sentry.utils.redis import (
    get_dynamic_cluster_from_options,
    is_instance_rb_cluster,
    is_instance_redis_cluster,
)
from sentry.utils.rollback_metrics import incr_rollback_metrics
from sentry.utils.services import build_instance_from_options

logger = logging.getLogger(__name__)

FEATURE_ADOPTION_REDIS_KEY = "organization-feature-adoption:{}"

# Languages
manager.add(0, "python", "Python", "language")
manager.add(1, "javascript", "JavaScript", "language")
manager.add(2, "node", "Node.js", "language")
manager.add(3, "ruby", "Ruby", "language")
manager.add(4, "java", "Java", "language")
manager.add(5, "cocoa", "Cocoa", "language")
manager.add(6, "objc", "Objective-C", "language")
manager.add(7, "php", "PHP", "language")
manager.add(8, "go", "Go", "language")
manager.add(9, "csharp", "C#", "language")
manager.add(10, "perl", "Perl", "language")
manager.add(11, "elixir", "Elixir", "language")
manager.add(12, "cfml", "CFML", "language")
manager.add(13, "groovy", "Groovy", "language")
manager.add(14, "csp", "CSP Reports", "language")
manager.add(15, "powershell", "PowerShell", "language")

# Frameworks
manager.add(20, "flask", "Flask", "integration", prerequisite=["python"])
manager.add(21, "django", "Django", "integration", prerequisite=["python"])
manager.add(22, "celery", "Celery", "integration", prerequisite=["python"])
manager.add(23, "bottle", "Bottle", "integration", prerequisite=["python"])
manager.add(24, "pylons", "Pylons", "integration", prerequisite=["python"])
manager.add(25, "tornado", "Tornado", "integration", prerequisite=["python"])
manager.add(26, "webpy", "web.py", "integration", prerequisite=["python"])
manager.add(27, "zope", "Zope", "integration", prerequisite=["python"])

# Configuration
manager.add(40, "first_event", "First Event", "code", prerequisite=["first_project"])
manager.add(41, "release_tracking", "Release Tracking", "code", prerequisite=["first_event"])
manager.add(
    42, "environment_tracking", "Environment Tracking", "code", prerequisite=["first_event"]
)
manager.add(43, "user_tracking", "User Tracking", "code", prerequisite=["first_event"])
manager.add(44, "custom_tags", "Custom Tags", "code", prerequisite=["first_event"])
manager.add(
    45, "source_maps", "Source Maps", "code", prerequisite=["first_event", ("javascript", "node")]
)
manager.add(46, "user_feedback", "User Feedback", "code", prerequisite=["user_tracking"])
manager.add(
    48,
    "breadcrumbs",
    "Breadcrumbs",
    "code",
    prerequisite=["first_event", ("python", "javascript", "node", "php")],
)
manager.add(49, "resolved_with_commit", "Resolve with Commit", "code")

# Web UI
manager.add(60, "first_project", "First Project", "web")
manager.add(61, "invite_team", "Invite Team", "web", prerequisite=["first_project"])
manager.add(62, "assignment", "Assign Issue", "web", prerequisite=["invite_team", "first_event"])
manager.add(
    63, "resolved_in_release", "Resolve in Next Release", "web", prerequisite=["release_tracking"]
)
manager.add(64, "advanced_search", "Advanced Search", "web", prerequisite=["first_event"])
manager.add(65, "saved_search", "Saved Search", "web", prerequisite=["advanced_search"])
manager.add(66, "inbound_filters", "Inbound Filters", "web", prerequisite=["first_event"])
manager.add(67, "alert_rules", "Alert Rules", "web", prerequisite=["first_event"])
manager.add(
    68,
    "issue_tracker_integration",
    "Issue Tracker Integration",
    "web",
    prerequisite=["first_project"],
)
manager.add(
    69,
    "notification_integration",
    "Notification Integration",
    "web",
    prerequisite=["first_project"],
)
manager.add(
    70,
    "delete_and_discard",
    "Delete and Discard Future Events",
    "web",
    prerequisite=["first_event"],
)
manager.add(71, "repo_linked", "Link a Repository", "web")
manager.add(72, "ownership_rule_created", "Ownership Rules", "web")
manager.add(73, "issue_ignored", "Ignore Issue", "web")

# Admin UI
manager.add(80, "sso", "SSO", "admin", prerequisite=["invite_team"])
manager.add(81, "data_scrubbers", "Data Scrubbers", "admin", prerequisite=["first_event"])

# API
manager.add(90, "release_created", "Create Release Using API", "api")
manager.add(91, "deploy_created", "Create Deploy Using API", "api")

manager.add(92, "metric_alert_rules", "Metric Alert Rules", "web", prerequisite=["first_event"])


class FeatureAdoptionRedisBackend:
    def __init__(self, key_tpl=FEATURE_ADOPTION_REDIS_KEY, **options):
        self.key_tpl = key_tpl
        self.is_redis_cluster, self.cluster, _config = get_dynamic_cluster_from_options(
            "SENTRY_FEATURE_ADOPTION_CACHE_OPTIONS", options
        )

    def get_client(self, key: str) -> rb.Cluster | RedisCluster:
        # WARN: Carefully as this works only for single key operations.
        if is_instance_redis_cluster(self.cluster, self.is_redis_cluster):
            return self.cluster
        elif is_instance_rb_cluster(self.cluster, self.is_redis_cluster):
            return self.cluster.get_local_client_for_key(key)
        else:
            raise AssertionError("unreachable")

    def in_cache(self, organization_id, feature_id):
        org_key = self.key_tpl.format(organization_id)
        return self.get_client(org_key).sismember(org_key, feature_id)

    def get_all_cache(self, organization_id):
        org_key = self.key_tpl.format(organization_id)
        return {int(v) for v in self.get_client(org_key).smembers(org_key)}

    def bulk_set_cache(self, organization_id, *args):
        if not args:
            return False

        org_key = self.key_tpl.format(organization_id)
        self.get_client(org_key).sadd(org_key, *args)
        return True


class FeatureAdoptionManager(BaseManager["FeatureAdoption"]):
    cache_backend: FeatureAdoptionRedisBackend = cast(
        FeatureAdoptionRedisBackend,
        build_instance_from_options(settings.SENTRY_FEATURE_ADOPTION_CACHE_OPTIONS),
    )

    def in_cache(self, organization_id, feature_id):
        return self.cache_backend.in_cache(organization_id, feature_id)

    def set_cache(self, organization_id, feature_id):
        return self.bulk_set_cache(organization_id, feature_id)

    def get_all_cache(self, organization_id):
        return self.cache_backend.get_all_cache(organization_id)

    def bulk_set_cache(self, organization_id, *args):
        return self.cache_backend.bulk_set_cache(organization_id, *args)

    def record(self, organization_id, feature_slug, **kwargs):
        try:
            feature_id = manager.get_by_slug(feature_slug).id
        except UnknownFeature as e:
            logger.exception(str(e))
            return False

        if not self.in_cache(organization_id, feature_id):
            row, created = self.create_or_update(
                organization_id=organization_id, feature_id=feature_id, complete=True
            )
            self.set_cache(organization_id, feature_id)
            return created

        return False

    def bulk_record(self, organization_id, feature_slugs, **kwargs):
        features = []

        try:
            feature_ids = {manager.get_by_slug(slug).id for slug in feature_slugs}
        except UnknownFeature as e:
            logger.exception(str(e))
            return False

        incomplete_feature_ids = feature_ids - self.get_all_cache(organization_id)

        if not incomplete_feature_ids:
            return False

        for feature_id in incomplete_feature_ids:
            features.append(
                FeatureAdoption(
                    organization_id=organization_id, feature_id=feature_id, complete=True
                )
            )

        try:
            with transaction.atomic(router.db_for_write(FeatureAdoption)):
                self.bulk_create(features)
        except IntegrityError:
            incr_rollback_metrics(FeatureAdoption)
            # This can occur if redis somehow loses the set of complete features and
            # we attempt to insert duplicate (org_id, feature_id) rows
            # This also will happen if we get parallel processes running `bulk_record` and
            # `get_all_cache` returns in the second process before the first process
            # can `bulk_set_cache`.
            pass

        return self.bulk_set_cache(organization_id, *incomplete_feature_ids)

    def get_by_slug(self, organization, slug):
        return self.filter(
            organization=organization, feature_id=manager.get_by_slug(slug).id
        ).first()


@region_silo_model
class FeatureAdoption(Model):
    __relocation_scope__ = RelocationScope.Excluded

    organization = FlexibleForeignKey("sentry.Organization")
    feature_id = models.PositiveIntegerField(choices=[(f.id, str(f.name)) for f in manager.all()])
    date_completed = models.DateTimeField(default=timezone.now)
    complete = models.BooleanField(default=False)
    applicable = models.BooleanField(default=True)  # Is this feature applicable to this team?
    data = JSONField()

    objects: ClassVar[FeatureAdoptionManager] = FeatureAdoptionManager()

    __repr__ = sane_repr("organization_id", "feature_id", "complete", "applicable")

    class Meta:
        app_label = "sentry"
        db_table = "sentry_featureadoption"
        unique_together = (("organization", "feature_id"),)
