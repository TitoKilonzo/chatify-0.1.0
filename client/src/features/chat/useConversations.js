import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';

export const conversationsKey = ['conversations'];
export const conversationKey = (id) => ['conversation', id];

export function useConversationsQuery() {
  return useQuery({
    queryKey: conversationsKey,
    queryFn: async () => (await api.get('/conversations')).conversations,
  });
}

export function useConversationDetail(conversationId, { enabled = true } = {}) {
  return useQuery({
    queryKey: conversationKey(conversationId),
    enabled,
    queryFn: async () => (await api.get(`/conversations/${conversationId}`)).conversation,
  });
}

/** Write a fresh detail into the cache and refresh the inbox row derived from it. */
function useCacheDetail() {
  const queryClient = useQueryClient();
  return (conversation) => {
    queryClient.setQueryData(conversationKey(conversation.id), conversation);
    queryClient.invalidateQueries({ queryKey: conversationsKey });
  };
}

export function useOpenDirect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId) =>
      (await api.post('/conversations/direct', { userId })).conversation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values) => (await api.post('/conversations/group', values)).conversation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
  });
}

/** Archive or mute, applied to the cache immediately and rolled back if the request fails. */
export function useSetPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...values }) => api.put(`/conversations/${id}/preferences`, values),
    onMutate: async ({ id, ...values }) => {
      await queryClient.cancelQueries({ queryKey: conversationsKey });
      const previous = queryClient.getQueryData(conversationsKey);
      queryClient.setQueryData(conversationsKey, (list) =>
        list?.map((conversation) =>
          conversation.id === id ? { ...conversation, ...values } : conversation,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationsKey, context.previous);
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: conversationsKey });
      queryClient.invalidateQueries({ queryKey: conversationKey(id) });
    },
  });
}

export function useRenameGroup(id) {
  const cache = useCacheDetail();
  return useMutation({
    mutationFn: async (name) => (await api.patch(`/conversations/${id}`, { name })).conversation,
    onSuccess: cache,
  });
}

export function useAddMembers(id) {
  const cache = useCacheDetail();
  return useMutation({
    mutationFn: async (userIds) =>
      (await api.post(`/conversations/${id}/members`, { userIds })).conversation,
    onSuccess: cache,
  });
}

export function useRemoveMember(id) {
  const cache = useCacheDetail();
  return useMutation({
    mutationFn: async (userId) =>
      (await api.delete(`/conversations/${id}/members/${userId}`)).conversation,
    onSuccess: cache,
  });
}

export function useSetRole(id) {
  const cache = useCacheDetail();
  return useMutation({
    mutationFn: async ({ userId, role }) =>
      (await api.patch(`/conversations/${id}/members/${userId}`, { role })).conversation,
    onSuccess: cache,
  });
}

export function useLeaveGroup(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/conversations/${id}/leave`, {}),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: conversationKey(id) });
      queryClient.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

export function useGroupAvatar(id) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: conversationKey(id) });
    queryClient.invalidateQueries({ queryKey: conversationsKey });
  };
  return {
    upload: useMutation({
      mutationFn: (file) => api.upload(`/conversations/${id}/avatar`, file, { method: 'PUT' }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: () => api.delete(`/conversations/${id}/avatar`),
      onSuccess: refresh,
    }),
  };
}

/** Debounce-friendly directory search; disabled until the query is long enough. */
export function useUserSearch(query) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['user-search', trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 15_000,
    queryFn: async () => (await api.get(`/users?q=${encodeURIComponent(trimmed)}`)).users,
  });
}
