import type { ResolvedRetryOptions } from "./defaults";

export function calculateDelay(
  attempt: number,
  options: ResolvedRetryOptions,
  error: Error | null,
  response: Response | null
): number {
  const { retryDelay, backoff, backoffFactor, jitter, maxDelay } = options;

  if (typeof retryDelay === "function") {
    return retryDelay(attempt, error, response);
  }

  let delay: number;
  if (backoff === "fixed") {
    delay = retryDelay;
  } else {
    // base * factor^attempt
    delay = retryDelay * Math.pow(backoffFactor, attempt);
  }

  // Full Jitter (AWS Architecture Blog)
  if (jitter) {
    delay = Math.random() * delay;
  }

  delay = Math.min(delay, maxDelay);

  return delay;
}
