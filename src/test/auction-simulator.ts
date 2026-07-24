import {
  type CircuitContext,
  QueryContext,
  sampleContractAddress,
  createConstructorContext,
  CostModel,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger,
} from "../../contracts/managed/auction/contract/index.js";
import { type AuctionPrivateState, witnesses } from "../witnesses.js";

export class AuctionSimulator {
  readonly contract: Contract<AuctionPrivateState>;
  circuitContext: CircuitContext<AuctionPrivateState>;

  constructor(secretKey: Uint8Array, bidAmount: bigint, bidSalt: Uint8Array, adminPk: Uint8Array) {
    this.contract = new Contract<AuctionPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext({ secretKey, bidAmount, bidSalt }, "0".repeat(64)),
      adminPk
    );
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  public switchUser(secretKey: Uint8Array, bidAmount: bigint, bidSalt: Uint8Array) {
    this.circuitContext.currentPrivateState = {
      secretKey,
      bidAmount,
      bidSalt
    };
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public getPrivateState(): AuctionPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  public submitCommitment(commitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.submitCommitment(
      this.circuitContext,
      commitment,
    ).context;
    return this.getLedger();
  }

  public transitionToReveal(): Ledger {
    this.circuitContext = this.contract.impureCircuits.transitionToReveal(
      this.circuitContext,
    ).context;
    return this.getLedger();
  }

  public revealBid(): Ledger {
    this.circuitContext = this.contract.impureCircuits.revealBid(
      this.circuitContext,
    ).context;
    return this.getLedger();
  }

  public closeAuction(): Ledger {
    this.circuitContext = this.contract.impureCircuits.closeAuction(
      this.circuitContext,
    ).context;
    return this.getLedger();
  }

  public publicKey(sk: Uint8Array): Uint8Array {
    return this.contract.circuits.publicKey(
      this.circuitContext,
      sk,
    ).result;
  }

  public computeCommitment(amount: bigint, salt: Uint8Array, sk: Uint8Array): Uint8Array {
    return this.contract.circuits.computeCommitment(
      this.circuitContext,
      amount,
      salt,
      sk
    ).result;
  }
}
