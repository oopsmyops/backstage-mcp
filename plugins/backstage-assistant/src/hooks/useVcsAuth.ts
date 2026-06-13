import { useCallback, useRef } from 'react';
import {
  githubAuthApiRef,
  gitlabAuthApiRef,
  useApiHolder,
} from '@backstage/frontend-plugin-api';
import type { VcsTokens } from '../api/types';

export function useVcsAuth() {
  const apiHolder = useApiHolder();
  const tokensRef = useRef<VcsTokens>({});

  const getVcsToken = useCallback(
    async (provider: string, scopes: string[]): Promise<VcsTokens> => {
      switch (provider) {
        case 'github': {
          const githubAuth = apiHolder.get(githubAuthApiRef);
          if (!githubAuth) {
            throw new Error('GitHub auth is not configured in this Backstage app.');
          }
          const token = await githubAuth.getAccessToken(scopes);
          const githubOwners = await fetchGitHubOwners(token);
          tokensRef.current = { ...tokensRef.current, github: token, githubOwners };
          break;
        }
        case 'gitlab': {
          const gitlabAuth = apiHolder.get(gitlabAuthApiRef);
          if (!gitlabAuth) {
            throw new Error('GitLab auth is not configured in this Backstage app.');
          }
          const token = await gitlabAuth.getAccessToken(scopes);
          const gitlabOwners = await fetchGitLabOwners(token);
          tokensRef.current = { ...tokensRef.current, gitlab: token, gitlabOwners };
          break;
        }
        default:
          throw new Error(`Unsupported VCS provider: ${provider}`);
      }
      return tokensRef.current;
    },
    [apiHolder],
  );

  const rejectVcsAuth = useCallback((provider: string): VcsTokens => {
    const rejectedProviders = Array.from(
      new Set([...(tokensRef.current.rejectedProviders ?? []), provider]),
    );
    tokensRef.current = { ...tokensRef.current, rejectedProviders };
    return tokensRef.current;
  }, []);

  return { getVcsToken, rejectVcsAuth, tokens: tokensRef };
}

async function fetchGitHubOwners(token: string): Promise<string[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };

  const [user, orgs] = await Promise.all([
    fetch('https://api.github.com/user', { headers })
      .then(response => (response.ok ? response.json() : undefined))
      .catch(() => undefined),
    fetch('https://api.github.com/user/orgs?per_page=100', { headers })
      .then(response => (response.ok ? response.json() : []))
      .catch(() => []),
  ]);

  const owners = new Set<string>();
  if (typeof user?.login === 'string') {
    owners.add(user.login);
  }
  if (Array.isArray(orgs)) {
    for (const org of orgs) {
      if (typeof org?.login === 'string') {
        owners.add(org.login);
      }
    }
  }
  return [...owners].sort((a, b) => a.localeCompare(b));
}

async function fetchGitLabOwners(token: string): Promise<string[]> {
  const response = await fetch(
    'https://gitlab.com/api/v4/groups?min_access_level=30&per_page=100',
    { headers: { Authorization: `Bearer ${token}` } },
  ).catch(() => undefined);

  if (!response?.ok) {
    return [];
  }

  const groups = await response.json();
  if (!Array.isArray(groups)) {
    return [];
  }

  return groups
    .map(group => group?.full_path ?? group?.path)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((a, b) => a.localeCompare(b));
}
