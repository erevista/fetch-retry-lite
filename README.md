# fetch-retry-lite

Lightweight fetch retry with exponential backoff and full jitter. Zero dependencies.

A modern, lightweight alternative to [fetch-retry](https://github.com/jonbern/fetch-retry) that fixes known issues and adds built-in exponential backoff with jitter.

## Features

- Automatic retry on network errors and 5xx responses
- Built-in exponential backoff with Full Jitter (default ON)
- Custom retry conditions (sync/async functions)
- Per-request configuration overrides
- Request body preservation on retry (fixes [fetch-retry#99](https://github.com/jonbern/fetch-retry/issues/99))
- Retry cap always enforced (fixes [fetch-retry#94](https://github.com/jonbern/fetch-retry/issues/94))
- Zero runtime dependencies
- TypeScript-first with full type definitions
- Dual CJS/ESM output
- < 2KB minified

## Install

```bash
npm install fetch-retry-lite
```

## Usage

```typescript
import { createRetryFetch } from 'fetch-retry-lite';

// Create with defaults (3 retries, exponential backoff, full jitter)
const fetchWithRetry = createRetryFetch();
const response = await fetchWithRetry('https://api.example.com/data');
```

### Custom configuration

```typescript
const fetchWithRetry = createRetryFetch({
  retries: 5,
  retryDelay: 500,
  retryOn: [500, 502, 503, 504, 429],
  jitter: false,
});
```

### Per-request overrides

```typescript
const response = await fetchWithRetry('https://api.example.com/data', {
  method: 'POST',
  body: JSON.stringify({ key: 'value' }),
  retry: { retries: 1 },
});
```

### Custom retry condition

```typescript
const fetchWithRetry = createRetryFetch({
  retryOn: async (attempt, error, response) => {
    if (error) return true;
    return response?.status === 503;
  },
  retries: 3, // cap is always enforced
});
```

### Fixed backoff

```typescript
const fetchWithRetry = createRetryFetch({
  backoff: 'fixed',
  retryDelay: 1000, // constant 1s interval
});
```

## API

### `createRetryFetch(defaults?)`

Returns a fetch-compatible function with retry support.

### `RetryOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retries` | `number` | `3` | Maximum retry count |
| `retryDelay` | `number \| Function` | `300` | Initial delay (ms) or custom delay function |
| `retryOn` | `number[] \| Function` | `[500, 502, 503, 504]` | Status codes or custom condition |
| `backoff` | `"exponential" \| "fixed"` | `"exponential"` | Backoff strategy |
| `backoffFactor` | `number` | `2` | Exponential multiplier |
| `jitter` | `boolean` | `true` | Enable Full Jitter |
| `maxDelay` | `number` | `30000` | Maximum delay cap (ms) |

## Comparison with fetch-retry

| Feature | fetch-retry | fetch-retry-lite |
|---------|:-----------:|:-------------------:|
| Built-in exponential backoff | Manual | Yes |
| Full Jitter | No | Yes (default ON) |
| Retry cap with custom retryOn | Broken (#94) | Always enforced |
| Request body on retry | Lost (#99) | Preserved |
| TypeScript types | Via .d.ts | Native |
| Bundle size | ~2KB | < 2KB |

## License

MIT
