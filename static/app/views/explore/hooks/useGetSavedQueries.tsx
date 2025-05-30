import {useCallback} from 'react';

import type {Actor} from 'sentry/types/core';
import {defined} from 'sentry/utils';
import {useApiQuery, useQueryClient} from 'sentry/utils/queryClient';
import useOrganization from 'sentry/utils/useOrganization';
import type {Mode} from 'sentry/views/explore/contexts/pageParamsContext/mode';

type Query = {
  fields: string[];
  groupby: string[];
  mode: Mode;
  orderby: string;
  query: string;
  visualize: Array<{
    chartType: number;
    yAxes: string[];
  }>;
};

export type SortOption =
  | 'name'
  | '-dateAdded'
  | '-dateUpdated'
  | 'mostPopular'
  | 'recentlyViewed'
  | 'starred'
  | 'mostStarred';

// Comes from ExploreSavedQueryModelSerializer
export type SavedQuery = {
  createdBy: Actor;
  dateAdded: string;
  dateUpdated: string;
  environment: string[];
  id: number;
  interval: string;
  lastVisited: string;
  name: string;
  position: number | null;
  projects: number[];
  query: [Query, ...Query[]];
  queryDataset: string;
  starred: boolean;
  end?: string;
  range?: string;
  start?: string;
};

type Props = {
  cursor?: string;
  exclude?: 'owned' | 'shared';
  perPage?: number;
  query?: string;
  sortBy?: SortOption[];
  starred?: boolean;
};

export function useGetSavedQueries({
  sortBy,
  exclude,
  starred,
  perPage = 5,
  cursor,
  query,
}: Props) {
  const organization = useOrganization();

  const {data, isLoading, getResponseHeader, ...rest} = useApiQuery<SavedQuery[]>(
    [
      `/organizations/${organization.slug}/explore/saved/`,
      {
        query: {
          sortBy,
          exclude,
          per_page: perPage,
          starred: starred ? 1 : undefined,
          cursor,
          query,
        },
      },
    ],
    {
      staleTime: 0,
    }
  );

  const pageLinks = getResponseHeader?.('Link');

  return {data, isLoading, pageLinks, ...rest};
}

export function useInvalidateSavedQueries() {
  const organization = useOrganization();
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [`/organizations/${organization.slug}/explore/saved/`],
    });
  }, [queryClient, organization.slug]);
}

export function useGetSavedQuery(id?: string) {
  const organization = useOrganization();
  const {data, isLoading, ...rest} = useApiQuery<SavedQuery>(
    [`/organizations/${organization.slug}/explore/saved/${id}/`],
    {
      staleTime: 0,
      enabled: defined(id),
    }
  );
  return {data, isLoading, ...rest};
}

export function useInvalidateSavedQuery(id?: string) {
  const organization = useOrganization();
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [`/organizations/${organization.slug}/explore/saved/${id}/`],
    });
  }, [queryClient, organization.slug, id]);
}
