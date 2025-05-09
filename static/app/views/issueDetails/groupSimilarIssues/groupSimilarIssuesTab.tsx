import * as Layout from 'sentry/components/layouts/thirds';
import GroupEventDetails from 'sentry/views/issueDetails/groupEventDetails/groupEventDetails';
import GroupSimilarIssues from 'sentry/views/issueDetails/groupSimilarIssues/similarIssues';
import {useHasStreamlinedUI} from 'sentry/views/issueDetails/utils';

function GroupSimilarIssuesTab() {
  const hasStreamlinedUI = useHasStreamlinedUI();

  // TODO(streamlined-ui): Remove this component and point router to GroupEventDetails
  // Similar issues will open in a drawer
  if (hasStreamlinedUI) {
    return <GroupEventDetails />;
  }

  return (
    <Layout.Body>
      <Layout.Main fullWidth>
        <GroupSimilarIssues />
      </Layout.Main>
    </Layout.Body>
  );
}

export default GroupSimilarIssuesTab;
