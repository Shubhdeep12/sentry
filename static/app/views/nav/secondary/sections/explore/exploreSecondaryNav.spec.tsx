import {initializeOrg} from 'sentry-test/initializeOrg';
import {render, screen} from 'sentry-test/reactTestingLibrary';

import Nav from 'sentry/views/nav';
import {NavContextProvider} from 'sentry/views/nav/context';

describe('ExploreSecondaryNav', () => {
  const {organization} = initializeOrg({
    organization: {
      features: [
        'performance-trace-explorer',
        'performance-view',
        'performance-default-explore-queries',
      ],
    },
  });

  beforeEach(() => {
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/explore/saved/',
    });

    MockApiClient.addMockResponse({
      url: `/organizations/org-slug/broadcasts/`,
      body: [],
    });

    MockApiClient.addMockResponse({
      url: `/assistant/`,
      body: [],
    });
  });

  it('renders', () => {
    render(
      <NavContextProvider>
        <Nav />
        <div id="main" />
      </NavContextProvider>,
      {
        organization,
        initialRouterConfig: {
          location: {
            pathname: '/organizations/org-slug/explore/traces/',
          },
        },
      }
    );

    expect(screen.getByText('Traces')).toBeInTheDocument();

    expect(screen.getByText('All Transactions')).toBeInTheDocument();
    expect(screen.getByText('DB Latency')).toBeInTheDocument();
    expect(screen.getByText('Slow HTTP Requests')).toBeInTheDocument();
    expect(screen.getByText('Worst Pageloads')).toBeInTheDocument();
  });
});
