import type { RetryOptions, RetryRequestInit } from "./types";
import { DEFAULT_RETRY_OPTIONS, type ResolvedRetryOptions } from "./defaults";
import { calculateDelay } from "./backoff";

function isStreamBody(body: BodyInit | null | undefined): boolean {
  return typeof ReadableStream !== "undefined" && body instanceof ReadableStream;
}

async function shouldRetry(
  retryOn: ResolvedRetryOptions["retryOn"],
  attempt: number,
  error: Error | null,
  response: Response | null
): Promise<boolean> {
  if (error) return true;

  if (typeof retryOn === "function") {
    return retryOn(attempt, error, response);
  }

  if (response && Array.isArray(retryOn)) {
    return retryOn.includes(response.status);
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mergeOptions(
  globalDefaults: Partial<RetryOptions>,
  perRequest?: Partial<RetryOptions>
): ResolvedRetryOptions {
  return {
    ...DEFAULT_RETRY_OPTIONS,
    ...globalDefaults,
    ...perRequest,
  };
}

export async function executeWithRetry(
  fetchFn: typeof fetch,
  input: RequestInfo | URL,
  init: RetryRequestInit | undefined,
  options: ResolvedRetryOptions
): Promise<Response> {
  const { retries } = options;

  // Only check init.body; Request.body is internally a ReadableStream
  // but is retryable via clone()
  const hasStreamBody = isStreamBody(init?.body);

  // Pre-clone to preserve body across retries (body is consumed on each fetch)
  let savedRequest: Request | null = null;
  if (input instanceof Request && !hasStreamBody) {
    savedRequest = input.clone();
  }

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let currentInput: RequestInfo | URL = input;
      if (savedRequest && attempt > 0) {
        currentInput = savedRequest.clone();
      }

      // When retrying with a cloned Request, passing init would
      // override the Request's own settings
      let initForFetch: RetryRequestInit | undefined;
      if (attempt === 0 || !savedRequest) {
        initForFetch = init;
      } else {
        initForFetch = undefined;
      }

      lastResponse = await fetchFn(currentInput, initForFetch);
      lastError = null;

      const retry = await shouldRetry(options.retryOn, attempt, null, lastResponse);
      if (!retry || attempt >= retries || hasStreamBody) {
        return lastResponse;
      }

      const delay = calculateDelay(attempt, options, null, lastResponse);
      await sleep(delay);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      lastResponse = null;

      if (hasStreamBody || attempt >= retries) {
        throw lastError;
      }

      const retry = await shouldRetry(options.retryOn, attempt, lastError, null);
      if (!retry) {
        throw lastError;
      }

      const delay = calculateDelay(attempt, options, lastError, null);
      await sleep(delay);
    }
  }

  // Unreachable in practice; satisfies the type checker
  if (lastError) throw lastError;
  return lastResponse!;
}
