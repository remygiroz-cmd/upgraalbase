/**
 * Request Queue with Concurrency Limiting and Retry Logic
 *
 * This module provides:
 * - Concurrency limiting (max N requests at a time)
 * - Automatic retry with exponential backoff for 429/5xx errors
 * - Request deduplication (same requests are batched)
 */

const MAX_CONCURRENT_REQUESTS = 4;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

class RequestQueue {
  constructor() {
    this.queue = [];
    this.activeRequests = 0;
    this.pendingRequests = new Map(); // For deduplication
  }

  /**
   * Add a request to the queue with deduplication
   * @param {string} key - Unique key for this request (for deduplication)
   * @param {Function} requestFn - Async function that performs the request
   * @returns {Promise} - Resolves with the request result
   */
  async enqueue(key, requestFn) {
    // Check if same request is already pending
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }

    const promise = new Promise((resolve, reject) => {
      this.queue.push({
        key,
        requestFn,
        resolve,
        reject,
        retries: 0
      });
    });

    this.pendingRequests.set(key, promise);

    // Clean up after promise resolves
    promise.finally(() => {
      this.pendingRequests.delete(key);
    });

    this.processQueue();
    return promise;
  }

  async processQueue() {
    if (this.activeRequests >= MAX_CONCURRENT_REQUESTS || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.activeRequests++;

    try {
      const result = await this.executeWithRetry(request);
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  async executeWithRetry(request) {
    const { requestFn, key } = request;
    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        // Check if error is retryable (429 or 5xx)
        const status = error?.status || error?.response?.status;
        const isRetryable = status === 429 || (status >= 500 && status < 600);

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw error;
        }

        // Calculate delay with exponential backoff + jitter
        const delay = Math.min(
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000,
          MAX_DELAY_MS
        );

        console.warn(`[RequestQueue] Request "${key}" failed with ${status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current queue stats
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      pendingDeduped: this.pendingRequests.size
    };
  }
}

// Singleton instance
export const requestQueue = new RequestQueue();

/**
 * Wrapper for Base44 entity operations with queue management
 */
export function createQueuedEntityWrapper(entity, entityName) {
  return {
    async list() {
      const key = `${entityName}:list`;
      return requestQueue.enqueue(key, () => entity.list());
    },

    async filter(filters) {
      const key = `${entityName}:filter:${JSON.stringify(filters)}`;
      return requestQueue.enqueue(key, () => entity.filter(filters));
    },

    async get(id) {
      const key = `${entityName}:get:${id}`;
      return requestQueue.enqueue(key, () => entity.get(id));
    },

    async create(data) {
      const key = `${entityName}:create:${Date.now()}`;
      return requestQueue.enqueue(key, () => entity.create(data));
    },

    async update(id, data) {
      const key = `${entityName}:update:${id}:${Date.now()}`;
      return requestQueue.enqueue(key, () => entity.update(id, data));
    },

    async delete(id) {
      const key = `${entityName}:delete:${id}:${Date.now()}`;
      return requestQueue.enqueue(key, () => entity.delete(id));
    }
  };
}

export default requestQueue;
