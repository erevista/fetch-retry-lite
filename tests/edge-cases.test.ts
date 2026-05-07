import { describe, it, expect, vi } from "vitest";
import { createRetryFetch } from "../src/index";

describe("edge cases", () => {
  describe("Request body preservation on retry", () => {
    it("preserves body when retrying with Request object", async () => {
      const bodies: (string | null)[] = [];
      const mockFetch = vi.fn(async (input: Request | string) => {
        if (input instanceof Request) {
          const text = await input.text();
          bodies.push(text);
        }
        if (bodies.length < 3) {
          return new Response(null, { status: 503 });
        }
        return new Response(null, { status: 200 });
      });

      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
      });

      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ key: "value" }),
      });

      const response = await fetchWithRetry(request, {
        // @ts-expect-error - injecting mock fetch for testing
        fetch: mockFetch,
      });

      expect(response.status).toBe(200);
      expect(bodies).toEqual([
        '{"key":"value"}',
        '{"key":"value"}',
        '{"key":"value"}',
      ]);
    });

    it("preserves body when retrying with (url, init) pair", async () => {
      const bodies: (string | null)[] = [];
      const mockFetch = vi.fn(async (_input: string, init?: RequestInit) => {
        if (init?.body) {
          bodies.push(init.body as string);
        }
        if (bodies.length < 2) {
          return new Response(null, { status: 500 });
        }
        return new Response(null, { status: 200 });
      });

      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
      });

      const response = await fetchWithRetry("https://example.com", {
        method: "POST",
        body: JSON.stringify({ data: "test" }),
        // @ts-expect-error
        fetch: mockFetch,
      });

      expect(response.status).toBe(200);
      expect(bodies[0]).toBe('{"data":"test"}');
      expect(bodies[1]).toBe('{"data":"test"}');
    });
  });

  describe("ReadableStream body skip", () => {
    it("does not retry when body is a ReadableStream", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("stream data"));
          controller.close();
        },
      });

      const mockFetch = vi.fn(async () => {
        return new Response(null, { status: 503 });
      });

      const fetchWithRetry = createRetryFetch({
        retries: 3,
        retryDelay: 1,
        jitter: false,
      });

      const response = await fetchWithRetry("https://example.com", {
        method: "POST",
        body: stream,
        // @ts-expect-error
        fetch: mockFetch,
        duplex: "half",
      } as RequestInit);

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
