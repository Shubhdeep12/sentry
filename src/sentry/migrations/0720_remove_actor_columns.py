# Generated by Django 5.0.4 on 2024-05-08 21:10

from django.db import migrations

from sentry.new_migrations.migrations import CheckedMigration
from sentry.new_migrations.monkey.special import SafeRunSQL


class Migration(CheckedMigration):
    # This flag is used to mark that a migration shouldn't be automatically run in production.
    # This should only be used for operations where it's safe to run the migration after your
    # code has deployed. So this should not be used for most operations that alter the schema
    # of a table.
    # Here are some things that make sense to mark as post deployment:
    # - Large data migrations. Typically we want these to be run manually so that they can be
    #   monitored and not block the deploy for a long period of time while they run.
    # - Adding indexes to large tables. Since this can take a long time, we'd generally prefer to
    #   run this outside deployments so that we don't block them. Note that while adding an index
    #   is a schema change, it's completely safe to run the operation after the code has deployed.
    # Once deployed, run these manually via: https://develop.sentry.dev/database-migrations/#migration-deployment

    is_post_deployment = False

    dependencies = [
        ("sentry", "0719_querysubscription_timebox_column_deletion_db"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[],
            database_operations=[
                SafeRunSQL(
                    sql="ALTER TABLE sentry_team DROP COLUMN actor_id",
                    reverse_sql="ALTER TABLE sentry_team ADD COLUMN actor_id BIGINT NULL",
                    hints={"tables": ["sentry_team"]},
                ),
                SafeRunSQL(
                    sql="ALTER TABLE sentry_rule DROP COLUMN owner_id",
                    reverse_sql="ALTER TABLE sentry_rule ADD COLUMN owner_id BIGINT NULL",
                    hints={"tables": ["sentry_rule"]},
                ),
                SafeRunSQL(
                    sql="ALTER TABLE sentry_alertrule DROP COLUMN owner_id",
                    reverse_sql="ALTER TABLE sentry_alertrule ADD COLUMN owner_id BIGINT NULL",
                    hints={"tables": ["sentry_alertrule"]},
                ),
                SafeRunSQL(
                    sql="ALTER TABLE sentry_grouphistory DROP COLUMN actor_id",
                    reverse_sql="ALTER TABLE sentry_grouphistory ADD COLUMN actor_id BIGINT NULL",
                    hints={"tables": ["sentry_grouphistory"]},
                ),
            ],
        )
    ]
