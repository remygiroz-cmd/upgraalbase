import { QueryClient } from '@tanstack/react-query';

/**
 * Global Query Client Configuration
 *
 * Optimized to prevent rate limiting (429 errors):
 * - staleTime: 5 minutes - data stays fresh, no unnecessary refetches
 * - gcTime: 10 minutes - cached data kept longer
 * - Smart retry: only retry on network/server errors, not 4xx client errors
 * - No refetch on window focus - prevents burst of requests when switching tabs
 */

// Custom retry function that handles 429 errors intelligently
const shouldRetry = (failureCount, error) => {
  // Don't retry client errors (4xx) except 429
  const status = error?.status || error?.response?.status;

  // 429 = rate limited, should retry with backoff
  if (status === 429) {
    return failureCount < 3;
  }

  // 4xx errors (except 429) should not be retried
  if (status >= 400 && status < 500) {
    return false;
  }

  // 5xx errors and network errors can be retried
  return failureCount < 2;
};

// Custom retry delay with exponential backoff for 429 errors
const retryDelay = (attemptIndex, error) => {
  const status = error?.status || error?.response?.status;

  // Longer delays for rate limiting
  if (status === 429) {
    return Math.min(2000 * Math.pow(2, attemptIndex), 30000);
  }

  // Standard exponential backoff for other errors
  return Math.min(1000 * Math.pow(2, attemptIndex), 10000);
};

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent refetch on window focus - avoids burst of requests
      refetchOnWindowFocus: false,

      // Don't refetch when component remounts
      refetchOnMount: false,

      // Don't refetch on reconnect immediately
      refetchOnReconnect: false,

      // Data stays fresh for 5 minutes - major reduction in API calls
      staleTime: 5 * 60 * 1000,

      // Keep cached data for 10 minutes
      gcTime: 10 * 60 * 1000,

      // Smart retry logic
      retry: shouldRetry,
      retryDelay: retryDelay,

      // Network mode: always try to fetch, but use cache if offline
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Mutations should retry on server errors
      retry: 1,
      retryDelay: 1000,
    },
  },
});