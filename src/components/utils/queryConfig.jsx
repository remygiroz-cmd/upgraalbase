import { QueryClient } from '@tanstack/react-query';

// Configuration optimisée de React Query pour éviter les rate limits
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - données considérées fraîches
      cacheTime: 10 * 60 * 1000, // 10 minutes - cache conservé
      refetchOnWindowFocus: false, // Éviter les refetch automatiques
      refetchOnMount: false, // Éviter les refetch au montage si données en cache
      retry: (failureCount, error) => {
        // Ne retry que sur les rate limits ou erreurs réseau
        if (error?.status === 429 || error?.message?.includes('Rate limit')) {
          return failureCount < 2; // Max 2 retry pour rate limit
        }
        if (error?.status >= 500) {
          return failureCount < 3; // Max 3 retry pour erreurs serveur
        }
        return false; // Pas de retry pour autres erreurs
      },
      retryDelay: (attemptIndex, error) => {
        // Backoff exponentiel avec jitter pour rate limits
        if (error?.status === 429 || error?.message?.includes('Rate limit')) {
          const baseDelay = Math.min(1000 * Math.pow(2, attemptIndex), 10000);
          const jitter = Math.random() * 1000;
          return baseDelay + jitter;
        }
        return Math.min(1000 * attemptIndex, 5000);
      },
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// Helper pour grouper les requêtes de même type
export class RequestBatcher {
  constructor(batchFn, delay = 50) {
    this.batchFn = batchFn;
    this.delay = delay;
    this.queue = [];
    this.timer = null;
  }

  add(params) {
    return new Promise((resolve, reject) => {
      this.queue.push({ params, resolve, reject });
      
      if (this.timer) {
        clearTimeout(this.timer);
      }

      this.timer = setTimeout(() => {
        this.flush();
      }, this.delay);
    });
  }

  async flush() {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];
    this.timer = null;

    try {
      const results = await this.batchFn(batch.map(item => item.params));
      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      batch.forEach(item => {
        item.reject(error);
      });
    }
  }
}