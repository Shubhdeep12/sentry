import {Component} from 'react';
import styled from '@emotion/styled';
import debounce from 'lodash/debounce';

import type {Client} from 'sentry/api';
import {Select} from 'sentry/components/core/select';
import {Tooltip} from 'sentry/components/core/tooltip';
import IdBadge from 'sentry/components/idBadge';
import {t} from 'sentry/locale';
import MemberListStore from 'sentry/stores/memberListStore';
import type {Member, Organization} from 'sentry/types/organization';
import type {User} from 'sentry/types/user';
import withApi from 'sentry/utils/withApi';

const getSearchKeyForUser = (user: User) =>
  `${user.email?.toLowerCase()} ${user.name?.toLowerCase()}`;

type MentionableUser = {
  actor: {
    id: string;
    name: string;
    type: 'user';
  };
  label: React.ReactElement;
  searchKey: string;
  value: string;
  disabled?: boolean;
};

type Props = {
  api: Client;
  onChange: (value: any) => any;
  organization: Organization;
  value: any;
  disabled?: boolean;
  onInputChange?: (value: any) => any;
  placeholder?: string;
  styles?: {control?: (provided: any) => any};
};

type State = {
  inputValue: string;
  loading: boolean;
  memberListLoading: boolean;
  options: MentionableUser[] | null;
};

type FilterOption<T> = {
  data: T;
  label: React.ReactNode;
  value: string;
};

/**
 * A component that allows you to select either members and/or teams
 */
class SelectMembers extends Component<Props, State> {
  state: State = {
    loading: false,
    inputValue: '',
    options: null,
    memberListLoading: MemberListStore.state.loading,
  };

  componentWillUnmount() {
    this.unlisteners.forEach(listener => {
      if (typeof listener === 'function') {
        listener();
      }
    });
  }

  unlisteners = [
    MemberListStore.listen(
      () => this.setState({memberListLoading: MemberListStore.state.loading}),
      undefined
    ),
  ];

  renderUserBadge = (user: User) => (
    <IdBadge avatarSize={24} user={user} hideEmail disableLink />
  );

  createMentionableUser = (user: User): MentionableUser => ({
    value: user.id,
    label: this.renderUserBadge(user),
    searchKey: getSearchKeyForUser(user),
    actor: {
      type: 'user',
      id: user.id,
      name: user.name,
    },
  });

  createUnmentionableUser = ({user}: any) => ({
    ...this.createMentionableUser(user),
    disabled: true,
    label: (
      <DisabledLabel>
        <Tooltip
          position="left"
          title={t('%s is not a member of project', user.name || user.email)}
        >
          {this.renderUserBadge(user)}
        </Tooltip>
      </DisabledLabel>
    ),
  });

  getMentionableUsers() {
    return MemberListStore.getAll().map(this.createMentionableUser);
  }

  handleChange = (newValue: any) => {
    this.props.onChange(newValue);
  };

  handleInputChange = (inputValue: any) => {
    this.setState({inputValue});

    if (this.props.onInputChange) {
      this.props.onInputChange(inputValue);
    }
  };

  queryMembers = debounce((query, cb) => {
    const {api, organization} = this.props;

    // Because this function is debounced, the component can potentially be
    // unmounted before this fires, in which case, `api` is null
    if (!api) {
      return null;
    }

    return api
      .requestPromise(`/organizations/${organization.slug}/members/`, {
        query: {query},
      })
      .then(
        (data: Member[]) => cb(null, data),
        err => cb(err)
      );
  }, 250);

  handleLoadOptions = (): Promise<MentionableUser[]> => {
    const usersInProject = this.getMentionableUsers();
    const usersInProjectById = usersInProject.map(({actor}) => actor.id);

    // Return a promise for `react-select`
    return new Promise((resolve, reject) => {
      this.queryMembers(this.state.inputValue, (err: any, result: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    })
      .then(
        members =>
          // Be careful here as we actually want the `users` object, otherwise it means user
          // has not registered for sentry yet, but has been invited
          (members
            ? (members as Member[])
                .filter(({user}) => user && !usersInProjectById.includes(user.id))
                .map(this.createUnmentionableUser)
            : []) as MentionableUser[]
      )
      .then((members: MentionableUser[]) => {
        const options = [...usersInProject, ...members];
        this.setState({options});
        return options;
      });
  };

  render() {
    const {placeholder, styles} = this.props;

    // If memberList is still loading we need to disable a placeholder Select,
    // otherwise `react-select` will call `loadOptions` and prematurely load
    // options
    if (this.state.memberListLoading) {
      return <StyledSelectControl isDisabled placeholder={t('Loading')} />;
    }

    return (
      <StyledSelectControl
        filterOption={(option: FilterOption<MentionableUser>, filterText: string) =>
          option?.data?.searchKey?.indexOf(filterText) > -1
        }
        loadOptions={this.handleLoadOptions}
        defaultOptions
        async
        isDisabled={this.props.disabled}
        cacheOptions={false}
        placeholder={placeholder}
        onInputChange={this.handleInputChange}
        onChange={this.handleChange}
        value={this.state.options?.find(({value}) => value === this.props.value)}
        styles={{
          ...styles,
          // @ts-expect-error TS(7006): Parameter 'provided' implicitly has an 'any' type.
          option: (provided, state: any) => ({
            ...provided,

            svg: {
              color: state.isSelected && state.theme.white,
            },
          }),
        }}
      />
    );
  }
}

const DisabledLabel = styled('div')`
  display: flex;
  opacity: 0.5;
  overflow: hidden; /* Needed so that "Add to team" button can fit */
`;

const StyledSelectControl = styled(Select)`
  .Select-value {
    display: flex;
    align-items: center;
  }
  .Select-input {
    margin-left: 32px;
  }
`;

export default withApi(SelectMembers);
