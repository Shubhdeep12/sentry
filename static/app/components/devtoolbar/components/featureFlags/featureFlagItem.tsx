import {Fragment, useContext, useState} from 'react';
import {css} from '@emotion/react';

import {Switch} from 'sentry/components/core/switch';
import AnalyticsProvider, {
  AnalyticsContext,
} from 'sentry/components/devtoolbar/components/analyticsProvider';
import useConfiguration from 'sentry/components/devtoolbar/hooks/useConfiguration';
import {inlineLinkCss} from 'sentry/components/devtoolbar/styles/link';
import {verticalPaddingCss} from 'sentry/components/devtoolbar/styles/panel';
import {smallCss} from 'sentry/components/devtoolbar/styles/typography';
import type {FlagValue} from 'sentry/components/devtoolbar/types';
import ExternalLink from 'sentry/components/links/externalLink';
import {Cell} from 'sentry/components/replays/virtualizedGrid/bodyCell';

import {useFeatureFlagsContext} from './featureFlagsContext';

type FeatureFlag = {name: string; override: FlagValue; value: FlagValue};

export default function FeatureFlagItem({flag}: {flag: FeatureFlag}) {
  const {featureFlags, trackAnalytics} = useConfiguration();
  const {eventName, eventKey} = useContext(AnalyticsContext);

  return (
    <Fragment>
      <Cell
        css={[
          verticalPaddingCss,
          css`
            align-items: flex-start;
            margin-left: var(--space200);
          `,
        ]}
      >
        {featureFlags?.urlTemplate?.(flag.name) ? (
          <ExternalLink
            css={[smallCss, inlineLinkCss]}
            href={featureFlags.urlTemplate(flag.name)}
            onClick={() => {
              trackAnalytics?.({
                eventKey: eventKey + '.click',
                eventName: eventName + ' clicked',
              });
            }}
          >
            {flag.name}
          </ExternalLink>
        ) : (
          <span>{flag.name}</span>
        )}
      </Cell>
      <Cell
        css={css`
          margin-right: var(--space200);
          justify-content: center;
        `}
      >
        <FlagValueInput flag={flag} />
      </Cell>
    </Fragment>
  );
}

function FlagValueInput({flag}: {flag: FeatureFlag}) {
  if (
    typeof flag.value === 'boolean' ||
    flag.override === true ||
    flag.override === false
  ) {
    return (
      <AnalyticsProvider keyVal="bool-override" nameVal="Boolean Override">
        <FlagValueBooleanInput flag={flag} />
      </AnalyticsProvider>
    );
  }

  return (
    <code>
      {flag.override === undefined ? String(flag.value) : String(flag.override)}
    </code>
  );
}

function FlagValueBooleanInput({flag}: {flag: FeatureFlag}) {
  const {eventName, eventKey} = useContext(AnalyticsContext);
  const {trackAnalytics} = useConfiguration();
  const {setOverride} = useFeatureFlagsContext();

  const [isActive, setIsActive] = useState(
    flag.override === undefined ? Boolean(flag.value) : Boolean(flag.override)
  );

  return (
    <label
      htmlFor={`toggle-${flag.name}`}
      css={css`
        display: flex;
        align-items: flex-end;
        align-self: flex-end;
        gap: var(--space100);
      `}
    >
      <code>{String(isActive)}</code>
      <Switch
        id={`toggle-${flag.name}`}
        checked={isActive}
        onChange={() => {
          setOverride(flag.name, !isActive);
          setIsActive(!isActive);
          trackAnalytics?.({
            eventKey: eventKey + '.toggled',
            eventName: eventName + ' toggled',
          });
        }}
      />
    </label>
  );
}
