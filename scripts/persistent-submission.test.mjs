import assert from 'node:assert/strict';
import { test } from 'node:test';
import { persistentSubmission } from './persistent-submission.mjs';

test('waits for finalization and preserves RPC connection until close', async () => {
  let callback, closed = false, unsubscribed = false;
  const api = {
    tx: { midnight: { sendMnTransaction: () => ({ send: cb => { callback = cb; return Promise.resolve(() => { unsubscribed = true; }); } }) } },
    rpc: { chain: { getHeader: async () => ({ number: 42 }) } },
    disconnect: async () => { closed = true; },
  };
  const service = await persistentSubmission({}, api);
  const pending = service.submitTransaction({ serialize: () => new Uint8Array([1]) });
  await callback({ status: { isInBlock: true } });
  assert.equal(closed, false);
  await callback({ status: { isFinalized: true, asFinalized: { toHex: () => 'block' } }, txHash: { toHex: () => 'tx' } });
  assert.equal((await pending).blockHeight, 42n);
  assert.equal(unsubscribed, true);
  assert.equal(closed, false);
  await service.close();
  assert.equal(closed, true);
});

test('rejects dispatch failure instead of reporting confirmation', async () => {
  const api = { tx: { midnight: { sendMnTransaction: () => ({ send: cb => {
    queueMicrotask(() => cb({ dispatchError: { toString: () => 'bad transaction' } }));
    return Promise.resolve(() => {});
  } }) } } };
  const service = await persistentSubmission({}, api);
  await assert.rejects(service.submitTransaction({ serialize: () => new Uint8Array() }), /Dispatch failed/);
});
