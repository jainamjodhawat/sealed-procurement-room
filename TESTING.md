# Verification checklist

The executable contract suite is `src/test/auction.test.ts`.

```bash
npm test
npm run compile
npm run build
```

Six passing scenarios cover auction initialization, private bid commitments, the reveal transition, a valid highest-bid update, commitment mismatch rejection, and late-bid rejection. The tests verify that bid values stay hidden until the reveal phase.

CI runs the contract and frontend verification jobs on every push and pull request.
