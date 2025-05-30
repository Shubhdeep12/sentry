import {RouterFixture} from 'sentry-fixture/routerFixture';

import {render, screen, userEvent, waitFor} from 'sentry-test/reactTestingLibrary';

import SsoForm from 'sentry/views/auth/ssoForm';

describe('SsoForm', function () {
  const emptyAuthConfig = {
    canRegister: false,
    githubLoginLink: '',
    googleLoginLink: '',
    hasNewsletter: false,
    serverHostname: '',
    vstsLoginLink: '',
  };

  async function doSso(apiRequest: jest.Mock) {
    await userEvent.type(
      screen.getByRole('textbox', {name: 'Organization ID'}),
      'org123'
    );
    await userEvent.click(screen.getByRole('button', {name: 'Continue'}));

    expect(apiRequest).toHaveBeenCalledWith(
      '/auth/sso-locate/',
      expect.objectContaining({data: {organization: 'org123'}})
    );
  }

  it('renders', function () {
    const authConfig = {
      ...emptyAuthConfig,
      serverHostname: 'testserver',
    };

    render(<SsoForm authConfig={authConfig} />, {
      deprecatedRouterMocks: true,
    });

    expect(screen.getByLabelText('Organization ID')).toBeInTheDocument();
  });

  it('handles errors', async function () {
    const mockRequest = MockApiClient.addMockResponse({
      url: '/auth/sso-locate/',
      method: 'POST',
      statusCode: 400,
      body: {
        detail: 'Invalid org name',
      },
    });

    render(<SsoForm authConfig={emptyAuthConfig} />, {
      deprecatedRouterMocks: true,
    });
    await doSso(mockRequest);

    expect(await screen.findByText('Invalid org name')).toBeInTheDocument();
  });

  it('handles success', async function () {
    const router = RouterFixture();
    const mockRequest = MockApiClient.addMockResponse({
      url: '/auth/sso-locate/',
      method: 'POST',
      statusCode: 200,
      body: {
        nextUri: '/next/',
      },
    });

    render(<SsoForm authConfig={emptyAuthConfig} />, {
      router,
      deprecatedRouterMocks: true,
    });
    await doSso(mockRequest);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith({pathname: '/next/'}));
  });
});
