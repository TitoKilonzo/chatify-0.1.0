import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { sessionKey } from '../auth/useSession.js';

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => api.patch('/users/me', values),
    onSuccess: (data) => queryClient.setQueryData(sessionKey, data.user),
  });
}

/** Changing the password replaces this device's session cookies and revokes all others. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (values) => api.post('/users/me/password', values),
  });
}

/** Upload or remove the signed-in user's avatar. */
export function useAvatar() {
  const queryClient = useQueryClient();
  const onSuccess = (data) => queryClient.setQueryData(sessionKey, data.user);
  return {
    upload: useMutation({
      mutationFn: (file) => api.upload('/users/me/avatar', file, { method: 'PUT' }),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: () => api.delete('/users/me/avatar'), onSuccess }),
  };
}
