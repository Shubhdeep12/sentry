import {Fragment} from 'react';
import styled from '@emotion/styled';

import * as Layout from 'sentry/components/layouts/thirds';
import SearchBar from 'sentry/components/searchBar';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import {trackAnalytics} from 'sentry/utils/analytics';
import {decodeScalar, decodeSorts} from 'sentry/utils/queryString';
import {escapeFilterValue} from 'sentry/utils/tokenizeSearch';
import useLocationQuery from 'sentry/utils/url/useLocationQuery';
import {useLocation} from 'sentry/utils/useLocation';
import {useNavigate} from 'sentry/utils/useNavigate';
import useOrganization from 'sentry/utils/useOrganization';
import * as ModuleLayout from 'sentry/views/insights/common/components/moduleLayout';
import {ModulePageFilterBar} from 'sentry/views/insights/common/components/modulePageFilterBar';
import {ModulePageProviders} from 'sentry/views/insights/common/components/modulePageProviders';
import {ModulesOnboarding} from 'sentry/views/insights/common/components/modulesOnboarding';
import {ModuleBodyUpsellHook} from 'sentry/views/insights/common/components/moduleUpsellHookWrapper';
import QueuesLandingLatencyChartWidget from 'sentry/views/insights/common/components/widgets/queuesLandingLatencyChartWidget';
import QueuesLandingThroughputChartWidget from 'sentry/views/insights/common/components/widgets/queuesLandingThroughputChartWidget';
import {QueryParameterNames} from 'sentry/views/insights/common/views/queryParameters';
import {BackendHeader} from 'sentry/views/insights/pages/backend/backendPageHeader';
import {
  isAValidSort,
  QueuesTable,
} from 'sentry/views/insights/queues/components/tables/queuesTable';
import {ModuleName} from 'sentry/views/insights/types';

const DEFAULT_SORT = {
  field: 'time_spent_percentage(span.duration)' as const,
  kind: 'desc' as const,
};

function QueuesLandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const organization = useOrganization();

  const query = useLocationQuery({
    fields: {
      destination: decodeScalar,
      [QueryParameterNames.DESTINATIONS_SORT]: decodeScalar,
    },
  });

  const sort =
    decodeSorts(query[QueryParameterNames.DESTINATIONS_SORT]).find(isAValidSort) ??
    DEFAULT_SORT;

  const handleSearch = (newDestination: string) => {
    trackAnalytics('insight.general.search', {
      organization,
      query: newDestination,
      source: ModuleName.QUEUE,
    });
    navigate({
      ...location,
      query: {
        ...location.query,
        destination: newDestination === '' ? undefined : newDestination,
        [QueryParameterNames.DESTINATIONS_CURSOR]: undefined,
      },
    });
  };

  // The QueuesTable component queries using the destination prop.
  // We wrap the user input in wildcards to allow for partial matches.
  const wildCardDestinationFilter = query.destination
    ? `*${escapeFilterValue(query.destination)}*`
    : undefined;

  return (
    <Fragment>
      <BackendHeader module={ModuleName.QUEUE} />

      <ModuleBodyUpsellHook moduleName={ModuleName.QUEUE}>
        <Layout.Body>
          <Layout.Main fullWidth>
            <ModuleLayout.Layout>
              <ModuleLayout.Full>
                <ModulePageFilterBar moduleName={ModuleName.QUEUE} />
              </ModuleLayout.Full>
              <ModulesOnboarding moduleName={ModuleName.QUEUE}>
                <ModuleLayout.Half>
                  <QueuesLandingLatencyChartWidget />
                </ModuleLayout.Half>
                <ModuleLayout.Half>
                  <QueuesLandingThroughputChartWidget />
                </ModuleLayout.Half>
                <ModuleLayout.Full>
                  <Flex>
                    <SearchBar
                      query={query.destination}
                      placeholder={t('Search for more destinations')}
                      onSearch={handleSearch}
                    />
                    <QueuesTable sort={sort} destination={wildCardDestinationFilter} />
                  </Flex>
                </ModuleLayout.Full>
              </ModulesOnboarding>
            </ModuleLayout.Layout>
          </Layout.Main>
        </Layout.Body>
      </ModuleBodyUpsellHook>
    </Fragment>
  );
}

function PageWithProviders() {
  return (
    <ModulePageProviders moduleName="queue" analyticEventName="insight.page_loads.queue">
      <QueuesLandingPage />
    </ModulePageProviders>
  );
}

export default PageWithProviders;

const Flex = styled('div')`
  display: flex;
  flex-direction: column;
  gap: ${space(2)};
`;
