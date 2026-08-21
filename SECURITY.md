# Security model — Sealed Procurement Room

This repository is operated independently by **jainamjodhawat**. Its keys, wallet session, contract address, private state, CI secrets, and incident decisions must not be reused by another project.

## Assets and trust boundaries

The protected assets are bid commitment binding, phase transitions, and administrator timing. The browser is untrusted presentation code; the injected wallet authorizes and balances transactions; the Compact circuit enforces ledger rules; the Preview indexer supplies finalized public state. A wallet “submit” prompt is not shown as success by this application until Midnight.js returns finalized transaction data.

## Non-negotiable controls

- Accept only `preview`, contract `auction`, and the address recorded in `deployment.json`.
- Never place a seed phrase, witness secret, credential, bid salt, Merkle path, or private-state database in Git, browser logs, analytics, screenshots, or support tickets.
- Keep demo mode disabled in production. Runtime validation fails closed if it is enabled.
- Treat wallet extensions and indexer responses as external dependencies; display actionable errors and preserve finalized transaction IDs.
- Rotate repository and deployment credentials after any suspected exposure. Testnet status does not make a seed phrase safe to publish.

## Known boundary

The repository proves contract logic and a real Preview deployment. It does not claim a third-party audit, regulated-production approval, mainnet availability, or an external issuer/registry service. Those are release gates, not UI features.

## Reporting

Open a private security advisory in this repository. Do not include private witness material. Include the app version, network, contract address, finalized transaction ID (if any), browser/wallet versions, and reproducible public steps.

