import { Ledger } from "../contracts/managed/auction/contract/index.js";
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export type AuctionPrivateState = {
  readonly secretKey: Uint8Array;
  readonly bidAmount: bigint;
  readonly bidSalt: Uint8Array;
};

export const createAuctionPrivateState = (secretKey: Uint8Array, bidAmount: bigint, bidSalt: Uint8Array) => ({
  secretKey,
  bidAmount,
  bidSalt
});

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, AuctionPrivateState>): [
    AuctionPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],

  bidAmount: ({
    privateState,
  }: WitnessContext<Ledger, AuctionPrivateState>): [
    AuctionPrivateState,
    bigint,
  ] => [privateState, privateState.bidAmount],

  bidSalt: ({
    privateState,
  }: WitnessContext<Ledger, AuctionPrivateState>): [
    AuctionPrivateState,
    Uint8Array,
  ] => [privateState, privateState.bidSalt],
};
