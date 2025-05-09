import {useMemo} from 'react';
import type {Theme} from '@emotion/react';
import styled from '@emotion/styled';

import {AssigneeBadge} from 'sentry/components/assigneeBadge';
import GroupStatusChart from 'sentry/components/charts/groupStatusChart';
import EventOrGroupExtraDetails from 'sentry/components/eventOrGroupExtraDetails';
import EventOrGroupHeader from 'sentry/components/eventOrGroupHeader';
import {getBadgeProperties} from 'sentry/components/group/inboxBadges/statusBadge';
import IssueStreamHeaderLabel from 'sentry/components/IssueStreamHeaderLabel';
import LoadingError from 'sentry/components/loadingError';
import LoadingIndicator from 'sentry/components/loadingIndicator';
import Panel from 'sentry/components/panels/panel';
import PanelHeader from 'sentry/components/panels/panelHeader';
import PanelItem from 'sentry/components/panels/panelItem';
import {PrimaryCount} from 'sentry/components/stream/group';
import {IconOpen} from 'sentry/icons';
import {t, tct, tn} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {Group} from 'sentry/types/group';
import type {Organization} from 'sentry/types/organization';
import {useApiQuery} from 'sentry/utils/queryClient';
import type RequestError from 'sentry/utils/requestError/requestError';
import {HeaderDivider} from 'sentry/views/issueList/actions';
import {AssigneeLabel} from 'sentry/views/issueList/actions/headers';
import {TraceDrawerComponents} from 'sentry/views/performance/newTraceDetails/traceDrawer/details/styles';
import {isTraceOccurence} from 'sentry/views/performance/newTraceDetails/traceGuards';
import {TraceIcons} from 'sentry/views/performance/newTraceDetails/traceIcons';
import type {TraceTree} from 'sentry/views/performance/newTraceDetails/traceModels/traceTree';
import type {TraceTreeNode} from 'sentry/views/performance/newTraceDetails/traceModels/traceTreeNode';
import {useHasTraceNewUi} from 'sentry/views/performance/newTraceDetails/useHasTraceNewUi';

type IssueProps = {
  issue: TraceTree.TraceIssue;
  organization: Organization;
};

const MAX_DISPLAYED_ISSUES_COUNT = 3;

const TABLE_WIDTH_BREAKPOINTS = {
  FIRST: 800,
  SECOND: 600,
  THIRD: 500,
  FOURTH: 400,
};

const issueOrderPriority: Record<keyof Theme['level'], number> = {
  fatal: 0,
  error: 1,
  warning: 2,
  sample: 3,
  info: 4,
  default: 5,
  unknown: 6,
};

function sortIssuesByLevel(
  a: TraceTree.TraceErrorIssue,
  b: TraceTree.TraceErrorIssue
): number {
  // If the level is not defined in the priority map, default to unknown
  const aPriority = issueOrderPriority[a.level] ?? issueOrderPriority.unknown;
  const bPriority = issueOrderPriority[b.level] ?? issueOrderPriority.unknown;

  return aPriority - bPriority;
}

function Issue(props: IssueProps) {
  const hasTraceNewUi = useHasTraceNewUi();
  const {
    isPending,
    data: fetchedIssue,
    isError,
    error,
  } = useApiQuery<Group>(
    [
      `/issues/${props.issue.issue_id}/`,
      {
        query: {
          collapse: 'release',
          expand: 'inbox',
        },
      },
    ],
    {
      enabled: !!props.issue.issue_id,
      staleTime: 2 * 60 * 1000,
    }
  );

  if (!hasTraceNewUi) {
    return (
      <LegacyIssue
        {...props}
        isError={isError}
        fetchedIssue={fetchedIssue}
        error={error}
        isPending={isPending}
      />
    );
  }

  const isOccurence: boolean = isTraceOccurence(props.issue);
  const iconClassName: string = isOccurence ? 'occurence' : props.issue.level;

  return isPending ? (
    <StyledLoadingIndicatorWrapper>
      <LoadingIndicator size={24} mini />
    </StyledLoadingIndicatorWrapper>
  ) : fetchedIssue ? (
    <StyledPanelItem>
      <IconWrapper className={iconClassName}>
        <IconBackground className={iconClassName}>
          <TraceIcons.Icon event={props.issue} />
        </IconBackground>
      </IconWrapper>
      <SummaryWrapper>
        <EventOrGroupHeader data={fetchedIssue} eventId={props.issue.event_id} />
        <EventOrGroupExtraDetails data={fetchedIssue} />
      </SummaryWrapper>
    </StyledPanelItem>
  ) : isError ? (
    <LoadingError
      message={
        error.status === 404 ? t('This issue was deleted') : t('Failed to fetch issue')
      }
    />
  ) : null;
}

const IconBackground = styled('div')`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  padding: 3px;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 16px;
    height: 16px;
    fill: ${p => p.theme.white};
  }
`;

const IconWrapper = styled('div')`
  border-radius: 50%;
  padding: ${space(0.25)};

  &.info {
    border: 1px solid var(--info);
    ${IconBackground} {
      background-color: var(--info);
    }
  }
  &.warning {
    border: 1px solid var(--warning);
    ${IconBackground} {
      background-color: var(--warning);
    }
  }
  &.debug {
    border: 1px solid var(--debug);
    ${IconBackground} {
      background-color: var(--debug);
    }
  }
  &.error,
  &.fatal {
    border: 1px solid var(--error);
    ${IconBackground} {
      background-color: var(--error);
    }
  }
  &.occurence {
    border: 1px solid var(--occurence);
    ${IconBackground} {
      background-color: var(--occurence);
    }
  }
  &.default {
    border: 1px solid var(--default);
    ${IconBackground} {
      background-color: var(--default);
    }
  }
  &.unknown {
    border: 1px solid var(--unknown);
    ${IconBackground} {
      background-color: var(--unknown);
    }
  }

  &.info,
  &.warning,
  &.occurence,
  &.default,
  &.unknown {
    svg {
      transform: translateY(-1px);
    }
  }
`;

const SummaryWrapper = styled('div')`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 100%;
  justify-content: left;
`;

function LegacyIssue(
  props: IssueProps & {
    error: RequestError | null;
    fetchedIssue: Group | undefined;
    isError: boolean;
    isPending: boolean;
  }
) {
  return props.isPending ? (
    <StyledLoadingIndicatorWrapper>
      <LoadingIndicator size={24} mini />
    </StyledLoadingIndicatorWrapper>
  ) : props.fetchedIssue ? (
    <StyledLegacyPanelItem>
      <NarrowIssueSummaryWrapper>
        <EventOrGroupHeader data={props.fetchedIssue} />
        <EventOrGroupExtraDetails data={props.fetchedIssue} />
      </NarrowIssueSummaryWrapper>
      <ChartWrapper>
        <GroupStatusChart
          stats={
            props.fetchedIssue.filtered
              ? props.fetchedIssue.filtered.stats?.['24h']!
              : props.fetchedIssue.stats?.['24h']!
          }
          secondaryStats={
            props.fetchedIssue.filtered ? props.fetchedIssue.stats?.['24h'] : []
          }
          groupStatus={
            getBadgeProperties(props.fetchedIssue.status, props.fetchedIssue.substatus)
              ?.status
          }
          hideZeros
          showSecondaryPoints
          showMarkLine
        />
      </ChartWrapper>
      <EventsWrapper>
        <EventsOrUsersWrapper>
          <PrimaryCount
            value={
              props.fetchedIssue.filtered
                ? props.fetchedIssue.filtered.count
                : props.fetchedIssue.count
            }
          />
        </EventsOrUsersWrapper>
      </EventsWrapper>
      <EventsOrUsersWrapper>
        <PrimaryCount
          value={
            props.fetchedIssue.filtered
              ? props.fetchedIssue.filtered.userCount
              : props.fetchedIssue.userCount
          }
        />
      </EventsOrUsersWrapper>
      <AssigneeWrapper>
        <AssigneeBadge assignedTo={props.fetchedIssue.assignedTo ?? undefined} />
      </AssigneeWrapper>
    </StyledLegacyPanelItem>
  ) : props.isError ? (
    <LoadingError
      message={
        props.error?.status === 404
          ? t('This issue was deleted')
          : t('Failed to fetch issue')
      }
    />
  ) : null;
}
type IssueListProps = {
  issues: TraceTree.TraceIssue[];
  node: TraceTreeNode<TraceTree.NodeValue>;
  organization: Organization;
};

export function IssueList({issues, node, organization}: IssueListProps) {
  const hasTraceNewUi = useHasTraceNewUi();
  const uniqueErrorIssues = useMemo(() => {
    const unique: TraceTree.TraceErrorIssue[] = [];

    const seenIssues: Set<number> = new Set();

    for (const issue of node.errors) {
      if (seenIssues.has(issue.issue_id)) {
        continue;
      }
      seenIssues.add(issue.issue_id);
      unique.push(issue);
    }

    return unique;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, node.errors.size]);

  const uniqueOccurences = useMemo(() => {
    const unique: TraceTree.TraceOccurrence[] = [];
    const seenIssues: Set<number> = new Set();

    for (const issue of node.occurrences) {
      if (seenIssues.has(issue.issue_id)) {
        continue;
      }
      seenIssues.add(issue.issue_id);
      unique.push(issue);
    }

    return unique;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, node.occurrences.size]);

  const uniqueIssues = useMemo(() => {
    return [...uniqueOccurences, ...uniqueErrorIssues.sort(sortIssuesByLevel)];
  }, [uniqueErrorIssues, uniqueOccurences]);

  if (!issues.length) {
    return null;
  }

  if (!hasTraceNewUi) {
    return (
      <StyledPanel>
        <IssueListHeader
          node={node}
          errorIssues={uniqueErrorIssues}
          occurences={uniqueOccurences}
        />
        {uniqueIssues.slice(0, MAX_DISPLAYED_ISSUES_COUNT).map((issue, index) => (
          <Issue key={index} issue={issue} organization={organization} />
        ))}
      </StyledPanel>
    );
  }

  return (
    <IssuesWrapper>
      <StyledPanel>
        {uniqueIssues.slice(0, MAX_DISPLAYED_ISSUES_COUNT).map((issue, index) => (
          <Issue key={index} issue={issue} organization={organization} />
        ))}
      </StyledPanel>
      {uniqueIssues.length > MAX_DISPLAYED_ISSUES_COUNT ? (
        <TraceDrawerComponents.IssuesLink node={node}>
          <IssueLinkWrapper>
            <IconOpen />
            {t(
              `Open %s more in Issues`,
              uniqueIssues.length - MAX_DISPLAYED_ISSUES_COUNT
            )}
          </IssueLinkWrapper>
        </TraceDrawerComponents.IssuesLink>
      ) : null}
    </IssuesWrapper>
  );
}

const IssueLinkWrapper = styled('div')`
  display: flex;
  align-items: center;
  gap: ${space(0.5)};
  margin-left: ${space(0.25)};
`;

function IssueListHeader({
  node,
  errorIssues,
  occurences,
}: {
  errorIssues: TraceTree.TraceErrorIssue[];
  node: TraceTreeNode<TraceTree.NodeValue>;
  occurences: TraceTree.TraceOccurrence[];
}) {
  const [singular, plural] = useMemo((): [string, string] => {
    const label = [t('Issue'), t('Issues')] as [string, string];
    for (const event of errorIssues) {
      if (event.level === 'error' || event.level === 'fatal') {
        return [t('Error'), t('Errors')];
      }
    }
    return label;
  }, [errorIssues]);

  const issueHeadingContent =
    errorIssues.length + occurences.length > MAX_DISPLAYED_ISSUES_COUNT
      ? tct(`[count]+  issues, [link]`, {
          count: MAX_DISPLAYED_ISSUES_COUNT,
          link: <StyledIssuesLink node={node}>{t('View All')}</StyledIssuesLink>,
        })
      : errorIssues.length > 0 && occurences.length === 0
        ? tct('[count] [text]', {
            count: errorIssues.length,
            text: errorIssues.length > 1 ? plural : singular,
          })
        : occurences.length > 0 && errorIssues.length === 0
          ? tct('[count] [text]', {
              count: occurences.length,
              text: tn('Performance issue', 'Performance Issues', occurences.length),
            })
          : tct(
              '[errors] [errorsText] and [performance_issues] [performanceIssuesText]',
              {
                errors: errorIssues.length,
                performance_issues: occurences.length,
                errorsText: errorIssues.length > 1 ? plural : singular,
                performanceIssuesText: tn(
                  'performance issue',
                  'performance issues',
                  occurences.length
                ),
              }
            );

  return (
    <StyledPanelHeader disablePadding>
      <StyledIssueStreamHeaderLabel>
        {issueHeadingContent}
        <HeaderDivider />
      </StyledIssueStreamHeaderLabel>
      <GraphLabel>
        {t('Trend')}
        <HeaderDivider />
      </GraphLabel>
      <EventsLabel>
        {t('Events')}
        <HeaderDivider />
      </EventsLabel>
      <UsersLabel>
        {t('Users')}
        <HeaderDivider />
      </UsersLabel>
      <AssigneeLabel>{t('Assignee')}</AssigneeLabel>
    </StyledPanelHeader>
  );
}

const StyledIssuesLink = styled(TraceDrawerComponents.IssuesLink)`
  margin-left: ${space(0.5)};
`;

const Heading = styled('div')`
  display: flex;
  align-self: center;
  margin: 0 ${space(2)};
  width: 60px;
  color: ${p => p.theme.subText};
`;

const GraphLabel = styled(IssueStreamHeaderLabel)`
  width: 200px;
  display: flex;
  justify-content: space-between;

  @container (width < ${TABLE_WIDTH_BREAKPOINTS.FIRST}px) {
    display: none;
  }
`;

const EventsHeading = styled(Heading)`
  @container (width < ${TABLE_WIDTH_BREAKPOINTS.SECOND}px) {
    display: none;
  }
`;

const EventsLabel = styled(EventsHeading)`
  display: flex;
  justify-content: space-between;
  width: 60px;
  margin-left: 0;
`;

const UsersHeading = styled(Heading)`
  display: flex;
  justify-content: center;

  @container (width < ${TABLE_WIDTH_BREAKPOINTS.THIRD}px) {
    display: none;
  }
`;

const UsersLabel = styled(UsersHeading)`
  display: flex;
  justify-content: space-between;
  width: 60px;
  margin-left: 0;
`;

const StyledPanel = styled(Panel)`
  container-type: inline-size;
`;

const IssuesWrapper = styled('div')`
  display: flex;
  flex-direction: column;
  gap: ${space(0.75)};
  justify-content: left;
  margin: ${space(1)} 0;

  ${StyledPanel} {
    margin-bottom: 0;
  }
`;

const StyledPanelHeader = styled(PanelHeader)`
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};
  text-transform: none;
`;

const StyledLoadingIndicatorWrapper = styled('div')`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: ${space(2)} 0;
  min-height: 76px;

  /* Add a border between two rows of loading issue states */
  & + & {
    border-top: 1px solid ${p => p.theme.border};
  }
`;

const ColumnWrapper = styled('div')`
  display: flex;
  justify-content: flex-end;
  align-self: center;
  width: 60px;
  margin: 0 ${space(2)};
`;

const EventsWrapper = styled(ColumnWrapper)`
  @container (width < ${TABLE_WIDTH_BREAKPOINTS.SECOND}px) {
    display: none;
  }
`;

const UserCountWrapper = styled(ColumnWrapper)`
  @container (width < ${TABLE_WIDTH_BREAKPOINTS.THIRD}px) {
    display: none;
  }
`;

const EventsOrUsersWrapper = styled(UserCountWrapper)`
  margin-left: 0;
  justify-content: center;
`;

const AssigneeWrapper = styled(ColumnWrapper)`
  margin-right: ${space(2)};
`;

const ChartWrapper = styled('div')`
  margin-left: ${space(4)};
  width: 200px;
  align-self: center;

  @container (width < ${TABLE_WIDTH_BREAKPOINTS.FIRST}px) {
    display: none;
  }
`;

const StyledLegacyPanelItem = styled(PanelItem)`
  justify-content: space-between;
  align-items: center;
  padding: ${space(1)} 0;
  line-height: 1.1;
`;

const StyledPanelItem = styled(StyledLegacyPanelItem)`
  justify-content: left;
  align-items: flex-start;
  gap: ${space(1)};
  height: fit-content;
  padding: ${space(1)} ${space(2)} ${space(1.5)} ${space(1)};
`;

const StyledIssueStreamHeaderLabel = styled(IssueStreamHeaderLabel)`
  display: flex;
  margin-left: ${space(2)};
  width: 66.66%;
`;

const NarrowIssueSummaryWrapper = styled('div')`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-left: ${space(2)};
  margin-right: ${space(2)};
  width: 66.66%;
  justify-content: center;
`;
