import { readFile, stat } from 'node:fs/promises';

const required = ['README.md', 'PROPOSAL.md', 'TESTING.md', 'src/test/auction.test.ts', 'deployment.json', 'SECURITY.md', 'OPERATIONS.md', 'src/runtimeConfig.ts', 'src/test/runtime-config.test.ts'];

for (const file of required) {
  const details = await stat(file).catch(() => null);
  if (!details?.isFile()) throw new Error(`Required reviewer file is missing: ${file}`);
}

const [readme, proposal, testing, suite, deploymentText] = await Promise.all([
  readFile('README.md', 'utf8'),
  readFile('PROPOSAL.md', 'utf8'),
  readFile('TESTING.md', 'utf8'),
  readFile('src/test/auction.test.ts', 'utf8'),
  readFile('deployment.json', 'utf8'),
]);

const deployment = JSON.parse(deploymentText);
const scenarios = suite.match(/\b(?:it|test)\s*\(/g)?.length ?? 0;
const addressPattern = /^[a-f0-9]{64}$/;
const transactionPattern = /^[a-f0-9]{64,66}$/;

if (!readme.includes('PROPOSAL.md') || !readme.includes('TESTING.md') || !readme.includes('SECURITY.md') || !readme.includes('OPERATIONS.md')) {
  throw new Error('README must link proposal, testing, security, and operations evidence.');
}
if (proposal.trim().length < 400) throw new Error('Product proposal is too short for review.');
if (!testing.includes('src/test/auction.test.ts')) throw new Error('TESTING.md must identify the executable suite.');
if (scenarios < 3) throw new Error(`Expected at least 3 tests; found ${scenarios}.`);
if (deployment.network !== 'preview') throw new Error('Deployment evidence must target Midnight Preview.');
if (deployment.contract !== 'auction' && deployment.contractName !== 'auction') {
  throw new Error('Deployment manifest does not identify the auction contract.');
}
if (!addressPattern.test(deployment.contractAddress ?? '')) throw new Error('Contract address is not a 64-character hex value.');
if (!transactionPattern.test(deployment.transactionHash ?? '')) throw new Error('Deployment transaction is not a valid hex identifier.');

console.log('Procurement release gate: proposal, src/test/auction.test.ts, and Preview deployment evidence verified.');
