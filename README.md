# Sealed-Bid Procurement Room

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

| Network | Midnight Preprod |
| --- | --- |
| Contract | `auction` |
| Address | `97ca9f6119b5c41f1161e3d1f50897e1569be041c5ed61650e6c1503ad66cbde` |
| Deployment transaction | `ef02a1e158be86632fe1219587d95ea8ae41b449e3af82c4bc66ee866b19580c` |
| Confirmation | Midnight Preprod indexer |

## Local commands

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

Run this only with Preprod funds and synthetic procurement lots. Do not use production bids or secrets.

## What the automation checks

The frontend workflow builds the Vite application. The contract workflow installs the matching Compact compiler, compiles the auction, executes tests, and uploads generated output. Tagged releases bundle the UI and contract artifacts; dependency audit is scheduled.

Demo: [watch the sealed procurement flow](https://drive.google.com/file/d/1jL1wpwGAf0QLbzpfDgt22L2805L5zs5a/view?usp=sharing).

