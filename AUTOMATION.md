# CI/CD automation

This project has separate automation for the frontend and Compact contract:

- 'frontend-ci.yml' installs from the lockfile and builds the Vite application.
- 'contract-ci.yml' compiles the Compact contract and runs its tests.
- 'release.yml' publishes frontend and generated contract artifacts for semantic-version tags.
- 'dependency-audit.yml' creates a scheduled npm audit report without placing wallet secrets in CI.

Live Midnight deployment remains a manual operation because it requires a configured Preprod proof server and wallet environment. Never store a recovery phrase or wallet file in repository secrets.
