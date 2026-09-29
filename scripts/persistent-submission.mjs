import { ApiPromise, WsProvider } from '@polkadot/api';

// Keep one connection alive until the wallet stops; do not disconnect per operation.
export async function persistentSubmission(configuration, suppliedApi) {
  const api = suppliedApi ?? await ApiPromise.create({ provider: new WsProvider(configuration.relayURL.toString()), noInitWarn: true });
  return {
    async submitTransaction(transaction) {
      const tx = transaction.serialize();
      return new Promise((resolve, reject) => {
        let unsubscribe;
        let settled = false;
        const finish = (error, result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          unsubscribe?.();
          error ? reject(error) : resolve(result);
        };
        const timeout = setTimeout(() => finish(new Error('Submission confirmation timed out; check chain before retrying.')), 180000);
        api.tx.midnight.sendMnTransaction(`0x${Buffer.from(tx).toString('hex')}`).send(async result => {
          if (result.dispatchError) return finish(new Error(`Dispatch failed: ${result.dispatchError.toString()}`));
          if (result.status.isInvalid || result.status.isDropped || result.status.isUsurped)
            return finish(new Error(`Submission rejected: ${result.status.type}`));
          if (result.status.isFinalized) {
            try {
              const header = await api.rpc.chain.getHeader(result.status.asFinalized);
              finish(null, {
                _tag: 'Finalized', tx, txHash: result.txHash.toHex(),
                blockHash: result.status.asFinalized.toHex(), blockHeight: BigInt(header.number.toString()),
              });
            } catch (error) { finish(error); }
          }
        }).then(stop => { unsubscribe = stop; if (settled) stop(); }).catch(error => finish(error));
      });
    },
    close: () => api.disconnect(),
  };
}
