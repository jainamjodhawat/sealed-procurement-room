import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import * as Rx from 'rxjs';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { contractName, makePlan, witnessFields, target } from './demo-plan.mjs';

export function verifyReceipt(receipt) {
  assert.equal(receipt.status,'SucceedEntirely','Chain did not confirm complete success');
  assert(receipt.txId && receipt.blockHash,'Missing finality evidence');
  return {status:receipt.status,txId:receipt.txId,blockHash:receipt.blockHash,blockHeight:receipt.blockHeight};
}

export async function runDemo({wallet, shieldedKey, dustKey, keystore, directory, configuration, save, account}) {
  setNetworkId('preprod');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const file = path.join(directory, 'confirmed-demo-batch.json');
  const journal = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
    network: 'preprod', account, contractName,
    adminSecret: randomBytes(32).toString('hex'), id: randomBytes(32).toString('hex'),
    storagePassword: randomBytes(48).toString('base64'),
    actors: Array.from({length:64}, () => ({secret:randomBytes(32).toString('hex'),salt:randomBytes(32).toString('hex')})),
    deployment: {}, calls: [],
  };
  assert.equal(journal.network, 'preprod'); assert.equal(journal.account, account);
  assert.equal(journal.contractName, contractName);
  const persist = () => {
    fs.writeFileSync(file + '.tmp', JSON.stringify(journal), {mode:0o600});
    fs.renameSync(file + '.tmp', file);
  };
  persist();
  const assetPath = path.join(root,'contracts','managed',contractName);
  const module = await import(path.join(assetPath,'contract','index.js'));
  const plan = makePlan(module.pureCircuits,journal);
  const witnesses = Object.fromEntries(witnessFields.map(field => [field, ({privateState}) =>
    [privateState,privateState[field === 'localSecretKey' ? 'secretKey' : field]]]));
  const compiledContract = CompiledContract.make(contractName,module.Contract).pipe(
    CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets(assetPath));
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter(s=>s.isSynced)));
  const zkConfigProvider = new NodeZkConfigProvider(assetPath);
  const publicDataProvider = indexerPublicDataProvider(configuration.indexerClientConnection.indexerHttpUrl,configuration.indexerClientConnection.indexerWsUrl);
  let active;
  const walletProvider = {
    getCoinPublicKey:()=>state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey:()=>state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const recipe = await wallet.balanceUnboundTransaction(tx,{shieldedSecretKeys:shieldedKey,dustSecretKey:dustKey},{ttl:ttl ?? new Date(Date.now()+1800000)});
      const signed = await wallet.signRecipe(recipe,payload=>keystore.signData(payload));
      return wallet.finalizeRecipe(signed);
    },
    async submitTx(tx) {
      assert(active,'Missing durable submission record');
      assert(!active.identifiers,'Refusing duplicate submission');
      active.identifiers = tx.identifiers();
      assert(active.identifiers.length > 0,'No transaction identifiers');
      if(active === journal.deployment) {
        for(const intent of tx.intents?.values() ?? []) for(const action of intent.actions ?? []) {
          if(typeof action.address === 'string' && action.initialState) active.contractAddress = action.address;
        }
      }
      active.status='submitted'; persist();
      const id = await wallet.submitTransaction(tx);
      active.submittedId=id; persist(); await save();
      return id;
    },
  };
  const providers = {
    walletProvider, midnightProvider:walletProvider, publicDataProvider, zkConfigProvider,
    proofProvider:httpClientProofProvider('http://127.0.0.1:6300',zkConfigProvider),
    privateStateProvider:levelPrivateStateProvider({
      midnightDbName:path.join(directory,'demo-contract-state'),privateStateStoreName:contractName+'-demo',
      accountId:walletProvider.getCoinPublicKey(),privateStoragePasswordProvider:()=>journal.storagePassword,
    }),
  };
  const record = (entry,receipt) => {
    entry.receipt=verifyReceipt(receipt);
    entry.status='confirmed'; persist();
  };
  async function reconcile(entry) {
    if(entry.status==='confirmed')return entry.receipt;
    assert(entry.identifiers?.length,'Unresolved call has no transaction ID; manual reconciliation needed');
    const receipt=await publicDataProvider.watchForTxData(entry.submittedId ?? entry.identifiers[0]);
    record(entry,receipt); return receipt;
  }
  let deployed;
  if(journal.deployment.identifiers) {
    await reconcile(journal.deployment);
    assert(journal.deployment.contractAddress,'Deployment address needs reconciliation; refusing redeploy');
    deployed=await findDeployedContract(providers,{compiledContract,contractAddress:journal.deployment.contractAddress,privateStateId:'demoState',initialPrivateState:plan.adminState});
  } else {
    active=journal.deployment;
    deployed=await deployContract(providers,{compiledContract,privateStateId:'demoState',initialPrivateState:plan.adminState,args:plan.constructorArgs});
    journal.deployment.contractAddress=deployed.deployTxData.public.contractAddress;
    record(journal.deployment,deployed.deployTxData.public);
  }
  const address=journal.deployment.contractAddress;
  console.log(JSON.stringify({contractName,deployed:address,network:'preprod'}));
  for(const [i,step] of plan.steps.entries()) {
    const entry=journal.calls[i] ?? (journal.calls[i]={kind:step.kind,circuit:step.circuit});
    assert.equal(entry.kind,step.kind); assert.equal(entry.circuit,step.circuit);
    if(!entry.identifiers && entry.status!=='confirmed') {
      await providers.privateStateProvider.set('demoState',step.state);
      active=entry; persist();
      const result=await deployed.callTx[step.circuit](...step.args);
      record(entry,result.public);
    } else await reconcile(entry);
    const chain=await publicDataProvider.queryContractState(address,{type:'blockHash',blockHash:entry.receipt.blockHash});
    assert(chain && step.verify(module.ledger(chain.data)),'Confirmed receipt has unexpected ledger outcome');
    entry.ledgerVerified=true; persist(); await save();
    const count=journal.calls.filter(c=>c.kind==='demo' && c.status==='confirmed' && c.ledgerVerified).length;
    console.log(JSON.stringify({contractName,kind:step.kind,circuit:step.circuit,confirmedDemoCalls:count,target,transactionId:entry.receipt.txId}));
  }
  assert.equal(journal.calls.filter(c=>c.kind==='demo' && c.status==='confirmed' && c.ledgerVerified).length,target);
  console.log(JSON.stringify({contractName,complete:true,confirmedDemoCalls:target}));
}
