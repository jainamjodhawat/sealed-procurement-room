import fs from 'node:fs';
import path from 'node:path';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { createKeystore, PublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';

// Read-only: no transaction creation, signing, registration, or submission.
globalThis.WebSocket = WebSocket;
const account = Number(process.env.MIDNIGHT_ACCOUNT_INDEX ?? '4');
if (!Number.isSafeInteger(account) || account < 0) throw new Error('Invalid account index');
const filename = process.env.MIDNIGHT_WALLET_FILE ?? path.join(process.env.HOME, '.nightforge/wallets/wallet.json');
const profile = JSON.parse(fs.readFileSync(filename, 'utf8'));
if (typeof profile.seed !== 'string' || !/^[0-9a-f]+$/i.test(profile.seed)) throw new Error('Expected locally stored hexadecimal seed');
const seed = Buffer.from(profile.seed, 'hex');
const hd = HDWallet.fromSeed(seed);
seed.fill(0); delete profile.seed;
if (hd.type !== 'seedOk') throw new Error('Wallet seed initialization failed');
const result = hd.hdWallet.selectAccount(account).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
hd.hdWallet.clear();
if (result.type !== 'keysDerived') throw new Error('Account derivation failed');
const shielded = ledger.ZswapSecretKeys.fromSeed(result.keys[Roles.Zswap]);
const dust = ledger.DustSecretKey.fromSeed(result.keys[Roles.Dust]);
const keystore = createKeystore(result.keys[Roles.NightExternal], 'preprod');
console.log(JSON.stringify({ network: 'preprod', account, address: PublicKey.fromKeyStore(keystore).address }));
const configuration = {
  networkId: 'preprod',
  indexerClientConnection: { indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql', indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws' },
  provingServerUrl: new URL('http://127.0.0.1:6300'),
  relayURL: new URL('wss://rpc.preprod.midnight.network'),
  costParameters: { additionalFeeOverhead: 1000n, feeBlocksMargin: 5 },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
};
let wallet;
const deadline = setTimeout(() => { console.error('Preflight timed out. No transactions submitted.'); process.exit(2); }, 310000);
try {
  wallet = await WalletFacade.init({ configuration,
    shielded: cfg => ShieldedWallet(cfg).startWithSecretKeys(shielded),
    unshielded: cfg => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: cfg => DustWallet(cfg).startWithSecretKey(dust, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shielded, dust);
  console.log('Wallet started; waiting for all wallet sections to sync.');
  const progress = p => ({connected:p.isConnected, applied:String(p.appliedIndex), target:String(p.highestRelevantWalletIndex)});
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.throttleTime(10000), Rx.tap(s => console.log(JSON.stringify({synced:s.isSynced, unshieldedCoins:s.unshielded.availableCoins.length, shielded:progress(s.shielded.state.progress), unshielded:progress(s.unshielded.progress), dust:progress(s.dust.state.progress)}))), Rx.filter(s => s.isSynced), Rx.timeout({each:300000})));
  console.log(JSON.stringify({synced:true, nightBaseUnits:String(state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n), dust:String(state.dust.balance(new Date())), transactionsSubmitted:0}));
} catch (error) {
  console.error('Wallet preflight failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
} finally {
  await wallet?.stop().catch(()=>{});
  clearTimeout(deadline);
}
