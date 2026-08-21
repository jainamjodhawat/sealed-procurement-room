# Product Proposal: Sealed-Bid Procurement Room

**Category selected:** Other — confidential procurement  
**Repository custodian:** `jainamjodhawat`  
**Operational state:** Commit/reveal MVP on Preview

## Problem

Procurement bids must remain competitive and confidential until the reveal window.

## Proposed product

Sealed-Bid Procurement Room implements a commit–reveal auction: suppliers commit a hash, reveal later with the matching salt, and the contract records the highest valid bid.

## Privacy model

Commitments and final winner state are auditable. Unrevealed bid amounts, salts, and losing bid details remain private until intentionally revealed.

## User journey

1. Suppliers submit commitments during bidding.
2. Administrator transitions the contract to reveal.
3. Suppliers reveal matching values.
4. Contract updates the highest bid and closes the auction.

## Success criteria

- Commitments are accepted only in bidding phase.
- Invalid reveals fail.
- Highest valid bid wins.
- Phase transitions are administrator-controlled.
