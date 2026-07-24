# Project Idea: Sealed-Bid Auction (Procurement Bidding)

A blind bidding system for procurement contracts where bids remain hidden until the submission period closes, followed by a verifiable ZK calculation to reveal the winning bid without exposing the losing bid amounts.

## 1. Midnight Network Specialty (ZK & Privacy Features)
*   **Sealed State Variables:** Bidders submit their bids into a private state ledger. No competitor can view other bid rates to adjust their pricing.
*   **Verifiable Execution:** Once the auction closes, a ZK proof compares the private bid values, proving which bid is the highest (or lowest, for procurement) while keeping losing prices secret.
*   **Cryptographic Commitments:** Bidders post a public hash commitment of their bid and lock their funds, which they can later reveal in ZK.

## 2. Technical Architecture (Compact Contract)
*   **Public State:**
    *   `auction_status`: Active, Closed, Settled.
    *   `bid_commitments`: Map of bidder addresses to their public bid hashes.
    *   `winning_bidder`: Address of the winner (revealed after closing).
*   **Private State (per Bidder):**
    *   `bid_value`: Numerical value of the bid.
    *   `bid_salt`: Salt to prevent hash brute-forcing.
*   **Circuits (ZK Proofs):**
    *   `submit_bid(bid_value, bid_salt)`:
        *Output:* Returns `bid_hash = hash(bid_value, bid_salt)` to record on-chain.
    *   `determine_winner(losing_bid_values, winning_bid_value)`:
        1. Verifies that all bids match their recorded hashes.
        2. Asserts that `winning_bid_value >= losing_bid_values[i]` (for all submitted bids).
        *Output:* Publishes the winner's address, leaving individual bid amounts unexposed.

## 3. Frontend & Integration (Level 3 Focus)
*   **User Interface:** A bidding dashboard displaying open auctions. Bidders type their rates, generate a local hash, lock their collateral, and register their bid. An admin portal coordinates the comparison phase.
*   **Lace/Midnight Wallet Integration:**
    *   Handles local ZK proof compilations.
    *   Locks escrow funds for bidding.

## 4. Verification & Testing Plan
*   **Unit Tests:**
    *   Verify that a bid is correctly registered as a hash commitment.
    *   Verify that the `determine_winner` circuit correctly identifies the winning price.
    *   Verify that losing bid values remain hidden throughout transaction histories.

---

## 5. How to Build & Deploy on Midnight
To build this project without errors, refer to the master build guide located at the root of the workspace: [BUILD_GUIDE.md](file:///Users/neelsubhashpote/moonlight/BUILD_GUIDE.md). It details how to:
1. Fix language pragma version mismatches.
2. Resolve SDK `4.x` dependency issues.
3. Start the Docker-based local ZK proof server.
4. Deploy the contract using a custom `deploy.mjs` script.
5. Prevent DUST gas errors.
