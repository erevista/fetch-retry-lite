# Changelog

## [0.1.0] - 2026-04-20

### Added

- `createRetryFetch()` factory function for creating retry-enabled fetch
- Automatic retry on network errors and configurable HTTP status codes (default: 500, 502, 503, 504)
- Built-in exponential backoff (base: 300ms, factor: 2)
- Full Jitter enabled by default for thundering herd prevention
- Fixed backoff strategy option
- Custom retry delay function support
- Custom retry condition function support (sync/async)
- Global defaults with per-request configuration overrides
- Request body preservation on retry (addresses fetch-retry#99)
- Retry cap always enforced regardless of retryOn type (addresses fetch-retry#94)
- ReadableStream body detection — skips retry for non-replayable streams
- `maxDelay` cap for backoff wait time
- Full TypeScript type definitions
- Dual CJS/ESM output
