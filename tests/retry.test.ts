import { describe, it, expect, vi, afterEach } from "vitest";
import { createRetryFetch } from "../src/index";

// Helper to create a mock fetch that returns responses in sequence
function createMockFetch(responses: Array<{ status: number } | Error>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const item = responses[callIndex++];
    if (item instanceof Error) throw item;
    return new Response(null, { status: item.status });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("core retry loop", () => {
  describe("5xx retry", () => {
    it("retries on 503 and succeeds on third attempt", async () => {
      const mockFetch = createMockFetch([
        { status: 503 },
        { status: 503 },
        { status: 200 },
      ]);
      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
      });

      const response = await fetchWithRetry("https://example.com");

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("retries on 500, 502, 503, 504 by default", async () => {
      for (const status of [500, 502, 503, 504]) {
        const mockFetch = createMockFetch([{ status }, { status: 200 }]);
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

        const fetchWithRetry = createRetryFetch({
          retries: 3,
          retryDelay: 1,
          jitter: false,
        });

        const response = await fetchWithRetry("https://example.com");

        expect(response.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledTimes(2);

        vi.restoreAllMocks();
      }
    });

    it("returns last 500 response after all retries exhausted", async () => {
      const mockFetch = createMockFetch([
        { status: 500 },
        { status: 500 },
        { status: 500 },
        { status: 500 },
      ]);
      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
      });

      const response = await fetchWithRetry("https://example.com");

      expect(response.status).toBe(500);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });
  });

  describe("network error retry", () => {
    it("retries on network error and succeeds", async () => {
      const mockFetch = createMockFetch([
        new TypeError("Failed to fetch"),
        { status: 200 },
      ]);
      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
      });

      const response = await fetchWithRetry("https://example.com");

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws network error after all retries exhausted", async () => {
      const mockFetch = createMockFetch([
        new TypeError("Failed to fetch"),
        new TypeError("Failed to fetch"),
        new TypeError("Failed to fetch"),
        new TypeError("Failed to fetch"),
      ]);
      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
      });

      await expect(
        fetchWithRetry("https://example.com")
      ).rejects.toThrow("Failed to fetch");

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe("4xx no-retry", () => {
    it("does not retry on 404", async () => {
      const mockFetch = createMockFetch([{ status: 404 }]);
      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
      });

      const response = await fetchWithRetry("https://example.com");

      expect(response.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry on 400, 401, 403", async () => {
      for (const status of [400, 401, 403]) {
        const mockFetch = createMockFetch([{ status }]);
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

        const fetchWithRetry = createRetryFetch({
          retries: 3,
          retryDelay: 1,
          jitter: false,
        });

        const response = await fetchWithRetry("https://example.com");

        expect(response.status).toBe(status);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        vi.restoreAllMocks();
      }
    });
  });

  describe("retries count", () => {
    it("retries: 0 means no retry (single attempt)", async () => {
      const mockFetch = createMockFetch([{ status: 503 }]);
      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

      const fetchWithRetry = createRetryFetch({
        retries: 0,
        retryDelay: 1,
        jitter: false,
      });

      const response = await fetchWithRetry("https://example.com");

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("exponential backoff timing", () => {
    it("increases delay exponentially (300ms, 600ms, 1200ms)", async () => {
      const delays: number[] = [];
      const originalSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, "setTimeout").mockImplementation(((
        fn: () => void,
        ms: number
      ) => {
        delays.push(ms);
        return originalSetTimeout(fn, 0); // execute immediately for test speed
      }) as typeof setTimeout);

      const mockFetch = createMockFetch([
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 200 },
      ]);
      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 300,
        backoffFactor: 2,
        jitter: false,
      });

      await fetchWithRetry("https://example.com");

      expect(delays).toEqual([300, 600, 1200]);
    });
  });
});
