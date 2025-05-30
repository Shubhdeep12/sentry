import logging

from django.conf import settings
from django.core.cache import cache

from sentry.net.http import Session
from sentry.silo.base import SiloMode
from sentry.tasks.base import instrumented_task
from sentry.taskworker.config import TaskworkerConfig
from sentry.taskworker.namespaces import sdk_control_tasks, sdk_tasks
from sentry.utils import metrics

logger = logging.getLogger(__name__)

SDK_INDEX_CACHE_KEY = "sentry:release-registry-sdk-versions"
APP_INDEX_CACHE_KEY = "sentry:release-registry-app-versions"
LAYER_INDEX_CACHE_KEY = "sentry:release-registry-layer-versions"

REQUEST_TIMEOUT = 10

CACHE_TTL = 3600


def _fetch_registry_url(relative_url):
    if not settings.SENTRY_RELEASE_REGISTRY_BASEURL:
        return {}

    base_url = settings.SENTRY_RELEASE_REGISTRY_BASEURL.rstrip("/")
    relative_url = relative_url.lstrip("/")

    full_url = f"{base_url}/{relative_url}"

    with metrics.timer(
        "release_registry.fetch.duration", tags={"url": relative_url}, sample_rate=1.0
    ):
        with Session() as session:
            response = session.get(full_url, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
        return response.json()


def _fetch_release_registry_data(**kwargs):
    """
    Fetch information about the latest SDK version from the release registry.

    More details about the registry: https://github.com/getsentry/sentry-release-registry/
    """
    logger.info(
        "release_registry.fetch.starting",
        extra={"release_registry_baseurl": str(settings.SENTRY_RELEASE_REGISTRY_BASEURL)},
    )

    if not settings.SENTRY_RELEASE_REGISTRY_BASEURL:
        logger.warning("Release registry URL is not specified, skipping the task.")
        return

    # Language SDKs
    sdk_data = _fetch_registry_url("/sdks")
    cache.set(SDK_INDEX_CACHE_KEY, sdk_data, CACHE_TTL)

    # Apps (e.g. sentry-cli)
    app_data = _fetch_registry_url("/apps")
    cache.set(APP_INDEX_CACHE_KEY, app_data, CACHE_TTL)

    # AWS Layers
    layer_data = _fetch_registry_url("/aws-lambda-layers")
    cache.set(LAYER_INDEX_CACHE_KEY, layer_data, CACHE_TTL)


@instrumented_task(
    name="sentry.tasks.release_registry.fetch_release_registry_data",
    time_limit=65,
    soft_time_limit=60,
    queue="release_registry",
    silo_mode=SiloMode.REGION,
    taskworker_config=TaskworkerConfig(namespace=sdk_tasks, processing_deadline_duration=65),
)
def fetch_release_registry_data(**kwargs):
    _fetch_release_registry_data(**kwargs)


@instrumented_task(
    name="sentry.tasks.release_registry.fetch_release_registry_data_control",
    time_limit=65,
    soft_time_limit=60,
    queue="release_registry.control",
    silo_mode=SiloMode.CONTROL,
    taskworker_config=TaskworkerConfig(
        namespace=sdk_control_tasks, processing_deadline_duration=65
    ),
)
def fetch_release_registry_data_control(**kwargs):
    _fetch_release_registry_data(**kwargs)
