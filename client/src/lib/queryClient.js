import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api.js';

const MAX_RETRIES = 2;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Client errors (4xx) are answers, not outages, so only network and server errors retry.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < MAX_RETRIES,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
    mutations: { retry: false },
  },
});
