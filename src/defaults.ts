import type { RetryOptions } from "./types";

export type ResolvedRetryOptions = Required<RetryOptions>;

export const DEFAULT_RETRY_OPTIONS: ResolvedRetryOptions = {
  retries: 3,
  retryDelay: 300,
  retryOn: [500, 502, 503, 504],
  backoff: "exponential",
  backoffFactor: 2,
  jitter: true,
  maxDelay: 30000,
};
