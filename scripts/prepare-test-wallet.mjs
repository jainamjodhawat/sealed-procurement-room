import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { UnshieldedWallet, createKeystore, PublicKey } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import { persistentSubmission } from './persistent-submission.mjs';

globalThis.WebSocket = WebSocket;
const account = 4;
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.nightforge', 'preprod-test');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const snapshotFile = path.join(directory, 'wallet-state.json');
const snapshot = fs.existsSync(snapshotFile) ? JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) : null;
if (snapshot && (snapshot.account !== account || snapshot.network !== 'preprod')) throw new Error('Wallet snapshot account/network mismatch');
const profile = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.nightforge/wallets/wallet.json'), 'utf8'));
const seed = Buffer.from(profile.seed, 'hex'); delete profile.seed;
const hd = HDWallet.fromSeed(seed); seed.fill(0);
if (hd.type !== 'seedOk') throw new Error('Invalid wallet profile');
const result = hd.hdWallet.selectAccount(account).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
hd.hdWallet.clear();
if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
const shieldedKey = ledger.ZswapSecretKeys.fromSeed(result.keys[Roles.Zswap]);
const dustKey = ledger.DustSecretKey.fromSeed(result.keys[Roles.Dust]);
const keystore = createKeystore(result.keys[Roles.NightExternal], 'preprod');
const configuration = {
  networkId: 'preprod',
  batchUpdates: { size: 1000, timeout: 100, spacing: 0 },
  indexerClientConnection: { indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql', indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws' },
  provingServerUrl: new URL('http://127.0.0.1:6300'), relayURL: new URL('wss://rpc.preprod.midnight.network'),
  costParameters: { additionalFeeOverhead: 1000n, feeBlocksMargin: 5 }, txHistoryStorage: new InMemoryTransactionHistoryStorage(),
};
const wallet = await WalletFacade.init({ configuration, submissionService: persistentSubmission,
  shielded: cfg => snapshot ? ShieldedWallet(cfg).restore(snapshot.shielded) : ShieldedWallet(cfg).startWithSecretKeys(shieldedKey),
  unshielded: cfg => snapshot ? UnshieldedWallet(cfg).restore(snapshot.unshielded) : UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
  dust: cfg => snapshot ? DustWallet(cfg).restore(snapshot.dust) : DustWallet(cfg).startWithSecretKey(dustKey, ledger.LedgerParameters.initialParameters().dust),
});
let saving = false;
async function save() {
  if (saving) return;
  saving = true;
  try {
    const [shielded, unshielded, dust] = await Promise.all([wallet.shielded.serializeState(), wallet.unshielded.serializeState(), wallet.dust.serializeState()]);
    fs.writeFileSync(snapshotFile + '.tmp', JSON.stringify({ account, network: 'preprod', shielded, unshielded, dust }), { mode: 0o600 });
    fs.renameSync(snapshotFile + '.tmp', snapshotFile);
  } finally { saving = false; }
}
let timer, progress;
try {
  await wallet.start(shieldedKey, dustKey);
  timer = setInterval(() => save().catch(() => console.error('Checkpoint failed')), 30000);
  progress = wallet.state().pipe(Rx.throttleTime(30000)).subscribe(s => console.log(JSON.stringify({ account, synced: s.isSynced, coins: s.unshielded.availableCoins.length, dust: String(s.dust.balance(new Date())), dustApplied: String(s.dust.state.progress.appliedIndex), dustTarget: String(s.dust.state.progress.highestRelevantWalletIndex) })));
  const state = await Rx.firstValueFrom(wallet.unshielded.state.pipe(Rx.filter(s => s.progress.isStrictlyComplete()), Rx.timeout(60000)));
  const unregistered = state.availableCoins.filter(c => c.meta?.registeredForDustGeneration !== true);
  const receiptFile = path.join(directory, 'dust-registration.json');
  if (unregistered.length && fs.existsSync(receiptFile)) throw new Error('Prior registration receipt exists; reconcile it before resubmitting');
  if (unregistered.length) {
    const recipe = await wallet.registerNightUtxosForDustGeneration(unregistered, keystore.getPublicKey(), data => keystore.signData(data));
    const finalized = await wallet.finalizeRecipe(recipe);
    fs.writeFileSync(receiptFile, JSON.stringify({ identifiers: finalized.identifiers(), status: 'awaiting-confirmation' }), { mode: 0o600, flag: 'wx' });
    const transactionId = await wallet.submitTransaction(finalized);
    fs.writeFileSync(receiptFile, JSON.stringify({ transactionId, status: 'finalized' }), { mode: 0o600 });
    console.log(JSON.stringify({ account, registrationFinalized: transactionId }));
  }
  await Rx.firstValueFrom(wallet.state().pipe(Rx.filter(s => s.isSynced && s.dust.balance(new Date()) > 0n), Rx.timeout(Number(process.env.WALLET_SYNC_TIMEOUT_MS || 900000))));
  console.log(JSON.stringify({ account, ready: true }));
  if (process.env.RUN_CONTRACT_DEMO === '1') {
    const { runDemo } = await import('./run-contract-demo.mjs');
    await runDemo({wallet, shieldedKey, dustKey, keystore, directory, configuration, save, account});
  }
} catch (error) {
  console.error(JSON.stringify({ account, ready: false, error: error instanceof Error ? error.message : 'Wallet preparation failed' }));
  process.exitCode = 1;
} finally {
  clearInterval(timer); progress?.unsubscribe(); await save(); await wallet.stop();
}
