import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { QueryContext, CostModel, createConstructorContext, sampleContractAddress } from '@midnight-ntwrk/compact-runtime';
import { contractName, makePlan, witnessFields, target } from './demo-plan.mjs';
const module = await import('../contracts/managed/' + contractName + '/contract/index.js');
const data = {adminSecret:randomBytes(32).toString('hex'),id:randomBytes(32).toString('hex'),actors:Array.from({length:64},()=>({secret:randomBytes(32).toString('hex'),salt:randomBytes(32).toString('hex')}))};
const plan = makePlan(module.pureCircuits,data);
const witnesses = Object.fromEntries(witnessFields.map(field=>[field,({privateState})=>[privateState,privateState[field==='localSecretKey'?'secretKey':field]]]));
const contract = new module.Contract(witnesses);
const initial = contract.initialState(createConstructorContext(plan.adminState,'0'.repeat(64)),...plan.constructorArgs);
let context = {currentPrivateState:initial.currentPrivateState,currentZswapLocalState:initial.currentZswapLocalState,costModel:CostModel.initialCostModel(),currentQueryContext:new QueryContext(initial.currentContractState.data,sampleContractAddress())};
let users=0;
for(const step of plan.steps){
  assert(!['closeElection','closeAuction','transitionToReveal','updateRoot'].includes(step.circuit));
  context.currentPrivateState=step.state;
  const result=contract.circuits[step.circuit](context,...step.args);
  context=result.context;
  assert(step.verify(module.ledger(context.currentQueryContext.state)),step.circuit);
  if(step.circuit.startsWith('verify'))assert.equal(result.result,true);
  if(step.kind==='demo')users++;
}
assert.equal(users,target);
console.log(JSON.stringify({contract:contractName,localScenariosPassed:users,chainTransactionsSubmitted:0}));
