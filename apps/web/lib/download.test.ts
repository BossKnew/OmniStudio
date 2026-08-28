import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadFiles, extensionForMime } from './download.ts';

test('uses safe extensions for supported image content types', () => {
  assert.equal(extensionForMime('image/png'), '.png');
  assert.equal(extensionForMime('image/jpeg'), '.jpg');
  assert.equal(extensionForMime('image/webp'), '.webp');
  assert.equal(extensionForMime('application/octet-stream'), '.png');
  assert.equal(extensionForMime('video/mp4'), '.mp4');
});

test('marks a hung file as failed after the download timeout', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const signal = init?.signal;
    return await new Promise((_resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });
  }) as typeof fetch;
  try {
    const result = await downloadFiles([{ url: 'https://example.test/a.png', name: 'a.png' }], undefined, 20);
    assert.equal(result.completed, 0);
    assert.deepEqual(result.failed, ['a.png']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
