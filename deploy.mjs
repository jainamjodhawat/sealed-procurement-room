import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { CostModel, QueryContext, createConstructorContext, sampleContractAddress } from '@midnight-ntwrk/compact-runtime';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { createKeystore, PublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import * as Rx from 'rxjs';
import path from 'node:path';
import fs from 'node:fs';
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';

globalThis.WebSocket = WebSocket;

// CONFIGURATION (Preview network; override only for an isolated local devnet)
const NETWORK_ID = 'preview';
const ACCOUNT_INDEX = 4;
const INDEXER = 'https://indexer.preview.midnight.network/api/v4/graphql';
const INDEXER_WS = 'wss://indexer.preview.midnight.network/api/v4/graphql/ws';
const NODE = 'https://rpc.preview.midnight.network';
const PROOF_SERVER = 'http://127.0.0.1:6300';

const auctionWitnesses = {
  localSecretKey: ({ privateState }) => [privateState, privateState.secretKey],
  bidAmount: ({ privateState }) => [privateState, privateState.bidAmount],
  bidSalt: ({ privateState }) => [privateState, privateState.bidSalt],
};

const isWalletReady = (state) => state.isSynced || state.unshielded.availableCoins.length > 0;

// Load nightforge wallet
const walletDir = path.join(process.env.HOME, '.nightforge', 'wallets');
if (!fs.existsSync(walletDir)) {
  fs.mkdirSync(walletDir, { recursive: true });
}
const files = fs.readdirSync(walletDir);
if (files.length === 0) {
  console.error("No Nightforge wallet found. Run 'npx nightforge wallet create' first.");
  process.exit(1);
}
const walletData = JSON.parse(fs.readFileSync(path.join(walletDir, files[0]), 'utf8'));
console.log(`Using wallet profile: ${walletData.name} | Preview account: ${ACCOUNT_INDEX}`);

async function deploy() {
  setNetworkId(NETWORK_ID);

  // Load compiled contract
  const zkConfigPath = path.resolve('contracts', 'managed', 'auction');
  const contractModule = await import(path.resolve(zkConfigPath, 'contract', 'index.js'));
  const compiledContract = CompiledContract.make('auction', contractModule.Contract).pipe(
    CompiledContract.withWitnesses(auctionWitnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
  console.log('Auction contract loaded.');

  // Derive keys
  const keys = deriveKeysFromSeed(walletData.seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());
  const deployerAddress = PublicKey.fromKeyStore(unshieldedKeystore).address;
  const contractSecret = keys[Roles.Zswap];
  const initialPrivateState = { secretKey: contractSecret, bidAmount: 0n, bidSalt: new Uint8Array(32) };

  // Setup configuration object
  const walletConfig = {
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: INDEXER, indexerWsUrl: INDEXER_WS },
    provingServerUrl: new URL(PROOF_SERVER),
    relayURL: new URL(NODE.replace(/^http/, 'ws')),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

  console.log('Initializing wallet components...');
  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  console.log('Wallet started. Syncing ledger...');

  // Wait for wallet to sync
  await Rx.firstValueFrom(wallet.state().pipe(Rx.throttleTime(5000), Rx.filter(isWalletReady)));
  console.log('Wallet synced.');

  let state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter(isWalletReady)));
  const balance = state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
  console.log(`Wallet Balance: ${balance.toLocaleString()} tNIGHT`);

  // DUST gas generation registration
  if (state.dust.availableCoins.length === 0) {
    const nightUtxos = state.unshielded.availableCoins.filter((c) => c.meta?.registeredForDustGeneration !== true);
    if (nightUtxos.length > 0) {
      console.log(`Registering ${nightUtxos.length} NIGHT UTXO(s) for DUST generation...`);
      const recipe = await wallet.registerNightUtxosForDustGeneration(
        nightUtxos, unshieldedKeystore.getPublicKey(), (p) => unshieldedKeystore.signData(p),
      );
      const finalized = await wallet.finalizeRecipe(recipe);
      await wallet.submitTransaction(finalized);
      console.log('DUST registration submitted.');
    }

    console.log('Waiting for DUST to accrue (this can take 2-5 minutes)...');
    await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter(isWalletReady),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
      ),
    );
  }

  state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter(isWalletReady)));
  const dustBal = state.dust.balance(new Date());
  console.log(`DUST Balance: ${dustBal.toLocaleString()} DUST`);

  // Build contract providers
  const walletProvider = await createWalletAndMidnightProvider({ wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore });
  const accountId = walletProvider.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, 'hex').toString('base64')}!`;
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'auction-private-state',
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(INDEXER, INDEXER_WS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };

  // Constructor arguments: adminPubkey (Bytes<32>)
  const bootstrapContract = new contractModule.Contract(auctionWitnesses);
  const bootstrapState = bootstrapContract.initialState(createConstructorContext(initialPrivateState, '0'.repeat(64)), new Uint8Array(32));
  const bootstrapContext = {
    currentPrivateState: bootstrapState.currentPrivateState,
    currentZswapLocalState: bootstrapState.currentZswapLocalState,
    costModel: CostModel.initialCostModel(),
    currentQueryContext: new QueryContext(bootstrapState.currentContractState.data, sampleContractAddress()),
  };
  const adminPubkey = bootstrapContract.circuits.publicKey(bootstrapContext, contractSecret).result;

  console.log('Generating ZK proofs & deploying Auction contract (takes 30-60 seconds)...');
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: 'auctionState',
    initialPrivateState,
    args: [adminPubkey],
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  const transactionHash = deployed.deployTxData.public.txId ?? deployed.deployTxData.public.transactionId ?? null;
  console.log('\n=== AUCTION CONTRACT SUCCESSFULLY DEPLOYED ===');
  console.log(`Address: ${contractAddress}`);
  console.log(`Network: ${NETWORK_ID}`);

  fs.writeFileSync('deployment.json', JSON.stringify({
    contractName: 'auction',
    contractAddress,
    network: NETWORK_ID,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    transactionHash,
  }, null, 2));
  console.log('Saved deployment details to deployment.json');
  
  await wallet.stop();
  process.exit(0);
}

function deriveKeysFromSeed(seed) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
  const result = hdWallet.hdWallet.selectAccount(ACCOUNT_INDEX).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

function signTransactionIntents(tx, signFn, proofMarker) {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize('signature', proofMarker, 'pre-binding', intent.serialize());
    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map((_, i) => cloned.fallibleUnshieldedOffer.signatures.at(i) ?? signature);
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map((_, i) => cloned.guaranteedUnshieldedOffer.signatures.at(i) ?? signature);
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
}

async function createWalletAndMidnightProvider(ctx) {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter(isWalletReady)));
  return {
    getCoinPublicKey() { return state.shielded.coinPublicKey.toHexString(); },
    getEncryptionPublicKey() { return state.shielded.encryptionPublicKey.toHexString(); },
    async balanceTx(tx, ttl) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) { return ctx.wallet.submitTransaction(tx); },
  };
}

deploy().catch((err) => {
  console.error('DEPLOY FAILED:', err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
