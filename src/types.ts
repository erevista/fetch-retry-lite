export type DelayFunction = (
  attempt: number,
  error: Error | null,
  response: Response | null
) => number;

export type RetryOnFunction = (
  attempt: number,
  error: Error | null,
  response: Response | null
) => boolean | Promise<boolean>;

export interface RetryOptions {
  /** Default: 3 */
  retries?: number;
  /** ms or custom function. Default: 300 */
  retryDelay?: number | DelayFunction;
  /** Status codes or custom function. Default: [500, 502, 503, 504] */
  retryOn?: number[] | RetryOnFunction;
  /** Default: "exponential" */
  backoff?: "exponential" | "fixed";
  /** Default: 2 */
  backoffFactor?: number;
  /** Full Jitter randomization. Default: true */
  jitter?: boolean;
  /** ms. Default: 30000 */
  maxDelay?: number;
}

export interface RetryRequestInit extends RequestInit {
  retry?: Partial<RetryOptions>;
}

export type RetryFetch = (
  input: RequestInfo | URL,
  init?: RetryRequestInit
) => Promise<Response>;
