# Sealed-Bid Procurement Room

![Frontend CI](https://github.com/jainamjodhawat/sealed-procurement-room/actions/workflows/frontend-ci.yml/badge.svg?branch=main) ![Contract CI](https://github.com/jainamjodhawat/sealed-procurement-room/actions/workflows/contract-ci.yml/badge.svg?branch=main)

A commit–reveal procurement floor that lets suppliers compete privately while preserving a verifiable winner.

## Auction phases

This project is intentionally phase-driven:

1. **Commit** — suppliers submit a hash commitment, not a bid amount.
2. **Reveal** — the matching amount and salt open the commitment.
3. **Close** — the contract records the highest valid bid and winner state.

The buyer dashboard makes the current phase, wallet status, commitment state, and deployment identity explicit.

## Contract behavior

The `auction` contract stores phase, commitments, highest bid, winner, and administrator state. Its circuits are:

- `submitCommitment(commitment)`
- `transitionToReveal()`
- `revealBid()`
- `closeAuction()`
- `computeCommitment(amount, salt, sk)`

Unrevealed amounts and salts are never required to be published during the commitment phase.

## Deployed instance

| Network | Midnight Preview |
| --- | --- |
| Contract | `auction` |
| Address | `de1f5ca3601f1068275948d0424764c2d8cbb105a07ba87cb59800d04c5d1b66` |
| Deployment transaction | `00c0bdf6a2a9d6a0e6acd9f3378c9bf715506eac22a4b7802b8538199747c2884c` |
| Deployment account | `mn_addr_preview1k3tkhet070x7z6xaahexcl83vhnzcwp88859ahn6rq57qj27hkrsaxmlh2` |
| Recorded | `2026-08-03T18:53:08.674Z` |
| Confirmation | Midnight Preview indexer |

## Local commands

Synthetic bidders use tNight supplied by the [Preview environment faucet](https://faucet.preview.midnight.network/).

```bash
npm install
npm run compile
npm test
npm run build
npm run dev
```

A deployment is a wallet/provider operation, not a simulated browser state:

```bash
npm run deploy
```

Run this only with Preview funds and synthetic procurement lots. Do not use production bids or secrets.

## What the automation checks

The frontend workflow builds the Vite application. The contract workflow installs the matching Compact compiler, compiles the auction, executes tests, and uploads generated output. Tagged releases bundle the UI and contract artifacts; dependency audit is scheduled.

Demo: [watch the sealed procurement flow](https://drive.google.com/file/d/1jL1wpwGAf0QLbzpfDgt22L2805L5zs5a/view?usp=sharing).

## Verification

Privacy is the product feature: supplier bid amounts stay hidden during commitment, while only the permitted reveal and winning outcome become public. Run `npm test`, `npm run compile`, and `npm run build`; the six contract scenarios are documented in [TESTING.md](./TESTING.md), the product scope is in [PROPOSAL.md](./PROPOSAL.md), and both CI workflows run on every push and pull request.
