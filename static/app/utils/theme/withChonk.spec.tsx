import {createRef} from 'react';
import type {DO_NOT_USE_ChonkTheme} from '@emotion/react';
import {useTheme} from '@emotion/react';
import {ConfigFixture} from 'sentry-fixture/config';
import {OrganizationFixture} from 'sentry-fixture/organization';
import {UserFixture} from 'sentry-fixture/user';

import {render, screen} from 'sentry-test/reactTestingLibrary';

import {ThemeAndStyleProvider} from 'sentry/components/themeAndStyleProvider';
import ConfigStore from 'sentry/stores/configStore';
import OrganizationStore from 'sentry/stores/organizationStore';

import {withChonk} from './withChonk';

function LegacyComponent() {
  const theme = useTheme();
  return <div>Legacy: {theme.isChonk ? 'true' : 'false'}</div>;
}
function ChonkComponent({theme}: {theme: DO_NOT_USE_ChonkTheme}) {
  return <div>Chonk: {theme.isChonk ? 'true' : 'false'}</div>;
}

function LegacyComponentWithRef({ref}: {ref?: React.Ref<HTMLDivElement>}) {
  const theme = useTheme();
  return <div ref={ref}>Legacy: {theme.isChonk ? 'true' : 'false'}</div>;
}

function ChonkComponentWithRef({
  ref,
}: {theme: DO_NOT_USE_ChonkTheme} & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  const theme = useTheme();
  return <div ref={ref}>Chonk: {theme.isChonk ? 'true' : 'false'}</div>;
}

describe('withChonk', () => {
  beforeEach(() => {
    ConfigStore.loadInitialData(
      ConfigFixture({
        user: UserFixture({
          options: {...UserFixture().options, prefersChonkUI: false},
        }),
      })
    );
    OrganizationStore.onUpdate(OrganizationFixture({features: []}));
  });

  it('renders legacy component when chonk is disabled', () => {
    const Component = withChonk(LegacyComponent, ChonkComponent, props => props);

    render(
      <ThemeAndStyleProvider>
        <Component />
      </ThemeAndStyleProvider>
    );

    expect(screen.getByText(/Legacy: false/)).toBeInTheDocument();
  });

  it('renders chonk component when chonk is enabled', () => {
    ConfigStore.loadInitialData(
      ConfigFixture({
        user: UserFixture({
          options: {...UserFixture().options, prefersChonkUI: true},
        }),
      })
    );

    OrganizationStore.onUpdate(
      OrganizationFixture({
        features: ['chonk-ui'],
      })
    );

    const Component = withChonk(LegacyComponent, ChonkComponent, props => props);

    render(
      <ThemeAndStyleProvider>
        <Component />
      </ThemeAndStyleProvider>
    );

    expect(screen.getByText(/Chonk: true/)).toBeInTheDocument();
  });

  it('passes ref to legacy component', () => {
    const ref = createRef<HTMLDivElement>();
    const Component = withChonk(
      LegacyComponentWithRef,
      ChonkComponentWithRef,
      props => props
    );

    render(
      <ThemeAndStyleProvider>
        <Component ref={ref} />
      </ThemeAndStyleProvider>
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(screen.getByText(/Legacy: false/)).toBeInTheDocument();
  });

  it('passes ref to chonk component', () => {
    ConfigStore.loadInitialData(
      ConfigFixture({
        user: UserFixture({
          options: {...UserFixture().options, prefersChonkUI: true},
        }),
      })
    );

    OrganizationStore.onUpdate(
      OrganizationFixture({
        features: ['chonk-ui'],
      })
    );

    const ref = createRef<HTMLDivElement>();
    const Component = withChonk(
      LegacyComponentWithRef,
      ChonkComponentWithRef,
      props => props
    );

    render(
      <ThemeAndStyleProvider>
        <Component ref={ref} />
      </ThemeAndStyleProvider>
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(screen.getByText(/Chonk: true/)).toBeInTheDocument();
  });
});
