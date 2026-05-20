import { describe, it, expect, vi, afterEach } from "vitest";
import { calculateDelay } from "../src/backoff";
import { DEFAULT_RETRY_OPTIONS, type ResolvedRetryOptions } from "../src/defaults";
import { createRetryFetch } from "../src/index";

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

describe("Full Jitter", () => {
  it("produces delay between 0 and calculated value (default ON)", () => {
    const options: ResolvedRetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      retryDelay: 300,
      backoffFactor: 2,
      jitter: true,
    };

    const results = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const delay = calculateDelay(0, options, null, null);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(300); // base * 2^0 = 300
      results.add(Math.round(delay));
    }

    // With 100 iterations, we should see variation
    expect(results.size).toBeGreaterThan(1);
  });

  it("jitter range scales with exponential backoff", () => {
    const options: ResolvedRetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      retryDelay: 300,
      backoffFactor: 2,
      jitter: true,
      maxDelay: 100000,
    };

    // attempt 2: base * 2^2 = 1200
    for (let i = 0; i < 50; i++) {
      const delay = calculateDelay(2, options, null, null);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1200);
    }
  });

  it("produces different values across multiple calls (not deterministic)", () => {
    const options: ResolvedRetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      retryDelay: 1000,
      jitter: true,
    };

    const delays = Array.from({ length: 10 }, () =>
      calculateDelay(0, options, null, null)
    );

    // At least some values should differ
    const unique = new Set(delays);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe("jitter disable", () => {
  it("produces exact exponential delay when jitter: false", () => {
    const options: ResolvedRetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      retryDelay: 300,
      backoffFactor: 2,
      jitter: false,
    };

    expect(calculateDelay(0, options, null, null)).toBe(300);
    expect(calculateDelay(1, options, null, null)).toBe(600);
    expect(calculateDelay(2, options, null, null)).toBe(1200);
  });
});

describe("fixed backoff strategy", () => {
  it("returns constant delay regardless of attempt", () => {
    const options: ResolvedRetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      retryDelay: 1000,
      backoff: "fixed",
      jitter: false,
    };

    expect(calculateDelay(0, options, null, null)).toBe(1000);
    expect(calculateDelay(1, options, null, null)).toBe(1000);
    expect(calculateDelay(2, options, null, null)).toBe(1000);
    expect(calculateDelay(5, options, null, null)).toBe(1000);
  });

  it("applies jitter to fixed delay when jitter: true", () => {
    const options: ResolvedRetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      retryDelay: 1000,
      backoff: "fixed",
      jitter: true,
    };

    const delays = Array.from({ length: 20 }, () =>
      calculateDelay(0, options, null, null)
    );

    // All should be between 0 and 1000
    delays.forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1000);
    });

    // Should have variation
    const unique = new Set(delays.map(Math.round));
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe("maxDelay cap", () => {
  it("clamps delay at maxDelay", () => {
    const options: ResolvedRetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      retryDelay: 1000,
      backoffFactor: 10,
      jitter: false,
      maxDelay: 5000,
    };

    // attempt 3: 1000 * 10^3 = 1000000 -> capped at 5000
    expect(calculateDelay(3, options, null, null)).toBe(5000);
  });

  it("does not affect delay below maxDelay", () => {
    const options: ResolvedRetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      retryDelay: 300,
      backoffFactor: 2,
      jitter: false,
      maxDelay: 30000,
    };

    // attempt 0: 300 (below 30000)
    expect(calculateDelay(0, options, null, null)).toBe(300);
  });

  it("caps jittered delay at maxDelay", () => {
    const options: ResolvedRetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      retryDelay: 1000,
      backoffFactor: 10,
      jitter: true,
      maxDelay: 500,
    };

    for (let i = 0; i < 50; i++) {
      const delay = calculateDelay(3, options, null, null);
      expect(delay).toBeLessThanOrEqual(500);
    }
  });
});

describe("backoff integration with retry loop", () => {
  it("uses fixed backoff in full retry cycle", async () => {
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
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const fetchWithRetry = createRetryFetch({
      retries: 3,
      retryDelay: 500,
      backoff: "fixed",
      jitter: false,
    });

    await fetchWithRetry("https://example.com");

    expect(delays).toEqual([500, 500]);
  });
});
