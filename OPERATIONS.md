# Operations runbook — Sealed Procurement Room

## Release gate

Run `npm ci`, `npm run verify:repository`, `npm test`, and `npm run build`. Both GitHub workflows must be green. Confirm that `public/deployment.json` exactly matches the root deployment record and that the production build contains no enabled demo mode.

## Before opening the app

1. Select Midnight **Preview** in the wallet.
2. Confirm contract `auction` and its address against `deployment.json`.
3. Confirm the wallet has sufficient NIGHT/DUST and is synchronized.
4. Load every proving/verifier asset from `public/midnight/auction`.
5. Execute one low-risk canary call and retain its finalized transaction ID.

## Health signals

Watch wallet detection, indexer connectivity, proving-asset HTTP failures, proof generation duration, rejected/partial transactions, and stale public ledger state. Diagnostics must exclude private inputs.

## Incident response

Stop new commitments, record the current phase and finalized block, preserve bidder salts privately, and publish a deterministic restart decision.

Recovery is complete only after the configured deployment validates, a canary transaction finalizes successfully, ledger state is read from the chain, CI is green, and the incident record contains no private data.

## Rollback

Roll back the frontend to the last green owner-authored release. A frontend rollback does not roll back ledger state. Contract changes require a new independent deployment and a deliberate update to all deployment evidence.

