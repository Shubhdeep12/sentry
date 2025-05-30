import {Fragment} from 'react';

import Feature from 'sentry/components/acl/feature';
import {t} from 'sentry/locale';
import {defined} from 'sentry/utils';
import {useLocation} from 'sentry/utils/useLocation';
import useOrganization from 'sentry/utils/useOrganization';
import {useGetSavedQueries} from 'sentry/views/explore/hooks/useGetSavedQueries';
import {PREBUILT_QUERIES} from 'sentry/views/explore/savedQueries/prebuiltQueries';
import {getExploreUrl} from 'sentry/views/explore/utils';
import {PRIMARY_NAV_GROUP_CONFIG} from 'sentry/views/nav/primary/config';
import {SecondaryNav} from 'sentry/views/nav/secondary/secondary';
import {ExploreSavedQueryNavItems} from 'sentry/views/nav/secondary/sections/explore/exploreSavedQueryNavItems';
import {PrimaryNavGroup} from 'sentry/views/nav/types';
import {isLinkActive} from 'sentry/views/nav/utils';

const MAX_STARRED_QUERIES_DISPLAYED = 20;

export function ExploreSecondaryNav() {
  const organization = useOrganization();
  const location = useLocation();

  const baseUrl = `/organizations/${organization.slug}/explore`;

  const {data: starredQueries} = useGetSavedQueries({
    starred: true,
    perPage: MAX_STARRED_QUERIES_DISPLAYED,
  });

  const hasDefaultExploreQueries = organization.features.includes(
    'performance-default-explore-queries'
  );

  const locationIsPrebuiltQuery =
    location.query.id === undefined && defined(location.query.title);

  return (
    <SecondaryNav>
      <SecondaryNav.Header>
        {PRIMARY_NAV_GROUP_CONFIG[PrimaryNavGroup.EXPLORE].label}
      </SecondaryNav.Header>
      <SecondaryNav.Body>
        <SecondaryNav.Section>
          <Feature features={['performance-trace-explorer', 'performance-view']}>
            <SecondaryNav.Item
              to={`${baseUrl}/traces/`}
              analyticsItemName="explore_traces"
              isActive={
                !locationIsPrebuiltQuery &&
                isLinkActive(`${baseUrl}/traces/`, location.pathname)
              }
            >
              {t('Traces')}
            </SecondaryNav.Item>
          </Feature>
          <Feature features="ourlogs-enabled">
            <SecondaryNav.Item to={`${baseUrl}/logs/`} analyticsItemName="explore_logs">
              {t('Logs')}
            </SecondaryNav.Item>
          </Feature>
          <Feature features="discover-basic">
            <SecondaryNav.Item
              to={`${baseUrl}/discover/homepage/`}
              activeTo={`${baseUrl}/discover/`}
              analyticsItemName="explore_discover"
            >
              {t('Discover')}
            </SecondaryNav.Item>
          </Feature>
          <Feature features="profiling">
            <SecondaryNav.Item
              to={`${baseUrl}/profiling/`}
              analyticsItemName="explore_profiles"
            >
              {t('Profiles')}
            </SecondaryNav.Item>
          </Feature>
          <Feature features="session-replay-ui">
            <SecondaryNav.Item
              to={`${baseUrl}/replays/`}
              analyticsItemName="explore_replays"
            >
              {t('Replays')}
            </SecondaryNav.Item>
          </Feature>
          <SecondaryNav.Item
            to={`${baseUrl}/releases/`}
            analyticsItemName="explore_releases"
          >
            {t('Releases')}
          </SecondaryNav.Item>
        </SecondaryNav.Section>
        <Feature features={['performance-trace-explorer', 'performance-view']}>
          {hasDefaultExploreQueries && (
            <Fragment>
              <SecondaryNav.Section>
                {PREBUILT_QUERIES.map((query, index) => (
                  <SecondaryNav.Item
                    to={getExploreUrl({
                      ...query.query[0], // We only have single query in prebuilt queries for the moment
                      groupBy: query.query[0].groupby,
                      sort: query.query[0].orderby,
                      field: query.query[0].fields,
                      title: query.name,
                      organization,
                    })}
                    isActive={
                      location.query.id === undefined && // Check id so we know it's not a user saved query
                      location.query.title === query.name
                    }
                    key={index}
                  >
                    {query.name}
                  </SecondaryNav.Item>
                ))}
              </SecondaryNav.Section>
            </Fragment>
          )}
          <SecondaryNav.Section title={t('Starred Queries')}>
            {starredQueries && starredQueries.length > 0 && (
              <ExploreSavedQueryNavItems queries={starredQueries} />
            )}
            <SecondaryNav.Item to={`${baseUrl}/saved-queries/`}>
              {t('All Queries')}
            </SecondaryNav.Item>
          </SecondaryNav.Section>
        </Feature>
      </SecondaryNav.Body>
    </SecondaryNav>
  );
}
