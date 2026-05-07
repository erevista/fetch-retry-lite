import type { RetryOptions, RetryFetch, RetryRequestInit } from "./types";
import { mergeOptions, executeWithRetry } from "./retry";

export type {
  RetryOptions,
  RetryFetch,
  RetryRequestInit,
  DelayFunction,
  RetryOnFunction,
} from "./types";

/**
 * Create a retry-enabled fetch function with optional global defaults.
 */
export function createRetryFetch(defaults?: Partial<RetryOptions>): RetryFetch {
  const globalDefaults = defaults ?? {};

  return async (
    input: RequestInfo | URL,
    init?: RetryRequestInit
  ): Promise<Response> => {
    const { retry: perRequestRetry, ...fetchInit } = init ?? {};
    const options = mergeOptions(globalDefaults, perRequestRetry);

    // Back door for injecting a mock fetch in tests
    const initWithFetch = init as Record<string, unknown> | undefined;
    const customFetch = initWithFetch?.fetch as typeof fetch | undefined;

    let fetchFn: typeof fetch;
    if (customFetch) {
      fetchFn = customFetch;
    } else {
      fetchFn = globalThis.fetch;
    }

    return executeWithRetry(fetchFn, input, fetchInit, options);
  };
}
