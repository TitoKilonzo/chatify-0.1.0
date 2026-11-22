import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, setSessionExpiredHandler } from '../../lib/api.js';
import { useDraftStore } from '../../stores/liveStores.js';

export const sessionKey = ['session'];

/**
 * Forget everything cached for the previous user and mark the session as signed out. The session
 * query itself is kept (and set to null) rather than cleared: clearing would detach components
 * that are still waiting on it, leaving the app stuck on its loading screen.
 */
function clearSession(queryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] });
  queryClient.setQueryData(sessionKey, null);
  useDraftStore.setState({ drafts: {} });
}

/** Wire the API client so an unrecoverable 401 signs the user out of the UI. */
export function registerSessionExpiry(queryClient) {
  setSessionExpiredHandler(() => clearSession(queryClient));
}

/**
 * The signed-in user, or null when signed out. Only real failures (network, server) put the
 * query in an error state; a 401 simply means there is no session.
 */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        const data = await api.get('/auth/me');
        return data.user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => api.post('/auth/login', values),
    onSuccess: (data) => queryClient.setQueryData(sessionKey, data.user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => api.post('/auth/register', values),
    onSuccess: (data) => queryClient.setQueryData(sessionKey, data.user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    // Sign out locally even if the request failed: the user's intent is clear, and the server
    // session expires on its own.
    onSettled: () => clearSession(queryClient),
  });
}
