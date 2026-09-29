import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('exposes the native WebSocket under both indexer import styles', async () => {
  class BrowserSocket {}
  vi.stubGlobal('WebSocket', BrowserSocket);
  vi.resetModules();
  const transport = await import('../browserWebSocket');
  expect(transport.WebSocket).toBe(BrowserSocket);
  expect(transport.default).toBe(BrowserSocket);
});
