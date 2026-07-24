import { AuctionSimulator } from "./auction-simulator.js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect } from "vitest";
import { randomBytes } from "./utils.js";
import { Phase } from "../../contracts/managed/auction/contract/index.js";

setNetworkId("undeployed");

describe("Sealed-Bid Auction Smart Contract Tests", () => {
  const adminSecret = randomBytes(32);

  // Setup helper to create a simulator
  const setupSimulator = (userSecret: Uint8Array, amount: bigint, salt: Uint8Array) => {
    const tempSim = new AuctionSimulator(adminSecret, 0n, new Uint8Array(32), new Uint8Array(32));
    const adminPk = tempSim.publicKey(adminSecret);
    return new AuctionSimulator(userSecret, amount, salt, adminPk);
  };

  it("1. Properly initializes contract parameters and admin key", () => {
    const userSecret = randomBytes(32);
    const simulator = setupSimulator(userSecret, 0n, new Uint8Array(32));
    const ledgerState = simulator.getLedger();

    expect(ledgerState.phase).toEqual(Phase.BIDDING);
    expect(ledgerState.highest_bid).toEqual(0n);
  });

  it("2. Allows bidders to submit bid commitments during bidding phase", () => {
    const userSecret = randomBytes(32);
    const amount = 100n;
    const salt = randomBytes(32);
    const simulator = setupSimulator(userSecret, amount, salt);

    const commitment = simulator.computeCommitment(amount, salt, userSecret);
    const ledgerState = simulator.submitCommitment(commitment);

    const pk = simulator.publicKey(userSecret);
    expect(ledgerState.commitments.member(pk)).toEqual(true);
  });

  it("3. Allows admin to transition phase to reveal", () => {
    const userSecret = randomBytes(32);
    const simulator = setupSimulator(userSecret, 0n, new Uint8Array(32));

    simulator.switchUser(adminSecret, 0n, new Uint8Array(32));
    const ledgerState = simulator.transitionToReveal();
    expect(ledgerState.phase).toEqual(Phase.REVEAL);
  });

  it("4. Updates highest bid when a valid higher bid is revealed", () => {
    const bidderSecret1 = randomBytes(32);
    const amount1 = 150n;
    const salt1 = randomBytes(32);

    const bidderSecret2 = randomBytes(32);
    const amount2 = 250n;
    const salt2 = randomBytes(32);

    // Initialize with bidder 1
    const simulator = setupSimulator(bidderSecret1, amount1, salt1);
    
    // Bidder 1 submits commitment
    const commit1 = simulator.computeCommitment(amount1, salt1, bidderSecret1);
    simulator.submitCommitment(commit1);

    // Bidder 2 submits commitment
    simulator.switchUser(bidderSecret2, amount2, salt2);
    const commit2 = simulator.computeCommitment(amount2, salt2, bidderSecret2);
    simulator.submitCommitment(commit2);

    // Admin transitions to reveal
    simulator.switchUser(adminSecret, 0n, new Uint8Array(32));
    simulator.transitionToReveal();

    // Reveal Bidder 1 (tally becomes 150)
    simulator.switchUser(bidderSecret1, amount1, salt1);
    let ledgerState = simulator.revealBid();
    expect(ledgerState.highest_bid).toEqual(150n);
    expect(ledgerState.winner).toEqual(simulator.publicKey(bidderSecret1));

    // Reveal Bidder 2 (tally becomes 250, winner changes)
    simulator.switchUser(bidderSecret2, amount2, salt2);
    ledgerState = simulator.revealBid();
    expect(ledgerState.highest_bid).toEqual(250n);
    expect(ledgerState.winner).toEqual(simulator.publicKey(bidderSecret2));
  });

  it("5. Rejects revealing a bid that does not match the submitted commitment", () => {
    const userSecret = randomBytes(32);
    const amount = 100n;
    const salt = randomBytes(32);
    const simulator = setupSimulator(userSecret, amount, salt);

    const commitment = simulator.computeCommitment(amount, salt, userSecret);
    simulator.submitCommitment(commitment);

    // Transition
    simulator.switchUser(adminSecret, 0n, new Uint8Array(32));
    simulator.transitionToReveal();

    // User tries to reveal a fake higher bid (amount 200)
    simulator.switchUser(userSecret, 200n, salt);
    expect(() => simulator.revealBid()).toThrow("failed assert: Revealed bid does not match commitment");
  });

  it("6. Rejects submitting commitments after phase transitions to reveal", () => {
    const userSecret = randomBytes(32);
    const amount = 100n;
    const salt = randomBytes(32);
    const simulator = setupSimulator(userSecret, amount, salt);

    // Admin transitions to reveal immediately
    simulator.switchUser(adminSecret, 0n, new Uint8Array(32));
    simulator.transitionToReveal();

    // User tries to submit commitment
    simulator.switchUser(userSecret, amount, salt);
    const commitment = simulator.computeCommitment(amount, salt, userSecret);
    expect(() => simulator.submitCommitment(commitment)).toThrow("failed assert: Auction is not in bidding phase");
  });
});
