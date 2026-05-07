import { describe, it, expect, vi } from "vitest";
import { createRetryFetch } from "../src/index";

function createMockFetch(responses: Array<{ status: number } | Error>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const item = responses[callIndex++];
    if (item instanceof Error) throw item;
    return new Response(null, { status: item.status });
  });
}

describe("configuration customization", () => {
  describe("custom retries count", () => {
    it("retries 5 times when retries: 5", async () => {
      const mockFetch = createMockFetch([
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 503 },
      ]);
      const fetchWithRetry = createRetryFetch({
        retries: 5,
        retryDelay: 1,
        jitter: false,
      });

      const response = await fetchWithRetry("https://example.com", {
        // @ts-expect-error
        fetch: mockFetch,
      });

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(6); // 1 initial + 5 retries
    });
  });

  describe("custom status codes", () => {
    it("retries on 429 when added to retryOn", async () => {
      const mockFetch = createMockFetch([{ status: 429 }, { status: 200 }]);
      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
        retryOn: [429, 500, 502, 503, 504],
      });

      const response = await fetchWithRetry("https://example.com", {
        // @ts-expect-error
        fetch: mockFetch,
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does not retry on 500 when removed from retryOn", async () => {
      const mockFetch = createMockFetch([{ status: 500 }]);
      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
        retryOn: [503],
      });

      const response = await fetchWithRetry("https://example.com", {
        // @ts-expect-error
        fetch: mockFetch,
      });

      expect(response.status).toBe(500);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("global + per-request override", () => {
    it("per-request retries overrides global", async () => {
      const mockFetch = createMockFetch([
        { status: 503 },
        { status: 503 },
      ]);
      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
      });

      const response = await fetchWithRetry("https://example.com", {
        // @ts-expect-error
        fetch: mockFetch,
        retry: { retries: 1 },
      });

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it("per-request retryOn overrides global", async () => {
      const mockFetch = createMockFetch([{ status: 429 }, { status: 200 }]);
      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
        retryOn: [500], // global: only 500
      });

      const response = await fetchWithRetry("https://example.com", {
        // @ts-expect-error
        fetch: mockFetch,
        retry: { retryOn: [429] }, // per-request: only 429
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe("custom retryOn function", () => {
  describe("sync function", () => {
    it("retries when function returns true", async () => {
      const mockFetch = createMockFetch([{ status: 418 }, { status: 200 }]);
      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
        retryOn: (_attempt, _error, response) => response?.status === 418,
      });

      const response = await fetchWithRetry("https://example.com", {
        // @ts-expect-error
        fetch: mockFetch,
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does not retry when function returns false", async () => {
      const mockFetch = createMockFetch([{ status: 503 }]);
      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
        retryOn: () => false,
      });

      const response = await fetchWithRetry("https://example.com", {
        // @ts-expect-error
        fetch: mockFetch,
      });

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("async function", () => {
    it("retries when async function returns true", async () => {
      const mockFetch = createMockFetch([{ status: 503 }, { status: 200 }]);
      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
        retryOn: async (_attempt, _error, response) => {
          return response?.status === 503;
        },
      });

      const response = await fetchWithRetry("https://example.com", {
        // @ts-expect-error
        fetch: mockFetch,
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("retries cap enforcement (Issue #94)", () => {
    it("stops after retries limit even when retryOn function always returns true", async () => {
      const mockFetch = createMockFetch([
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 503 },
      ]);
      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
        retryOn: () => true, // always wants to retry
      });

      const response = await fetchWithRetry("https://example.com", {
        // @ts-expect-error
        fetch: mockFetch,
      });

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries (capped!)
    });

    it("stops after retries limit with async retryOn that always returns true", async () => {
      const mockFetch = createMockFetch([
        new TypeError("fail"),
        new TypeError("fail"),
        new TypeError("fail"),
        new TypeError("fail"),
        new TypeError("fail"),
      ]);
      const fetchWithRetry = createRetryFetch({
        retries: 2,
        retryDelay: 1,
        jitter: false,
        retryOn: async () => true,
      });

      await expect(
        fetchWithRetry("https://example.com", {
          // @ts-expect-error
          fetch: mockFetch,
        })
      ).rejects.toThrow("fail");

      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });
});

describe("custom retryDelay function", () => {
  it("uses custom delay function", async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms: number
    ) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0);
    }) as typeof setTimeout);

    const mockFetch = createMockFetch([
      { status: 503 },
      { status: 503 },
      { status: 200 },
    ]);
    const fetchWithRetry = createRetryFetch({
      retries: 3,
      retryDelay: (attempt) => (attempt + 1) * 100,
      jitter: false,
    });

    await fetchWithRetry("https://example.com", {
      // @ts-expect-error
      fetch: mockFetch,
    });

    expect(delays).toEqual([100, 200]);

    vi.restoreAllMocks();
  });

  it("passes error and response to delay function", async () => {
    const calls: Array<{
      attempt: number;
      error: Error | null;
      status: number | null;
    }> = [];

    const mockFetch = createMockFetch([
      { status: 503 },
      new TypeError("network"),
      { status: 200 },
    ]);
    const fetchWithRetry = createRetryFetch({
      retries: 3,
      retryDelay: (attempt, error, response) => {
        calls.push({
          attempt,
          error: error,
          status: response?.status ?? null,
        });
        return 1;
      },
      jitter: false,
    });

    await fetchWithRetry("https://example.com", {
      // @ts-expect-error
      fetch: mockFetch,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ attempt: 0, error: null, status: 503 });
    expect(calls[1]?.error).toBeInstanceOf(TypeError);
    expect(calls[1]?.status).toBeNull();
  });
});
