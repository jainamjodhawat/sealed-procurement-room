import { describe, expect, it } from 'vitest';
import { verifyProcurementDeployment, validateProcurementDeploymentRuntime } from '../runtimeConfig';

const deployment = {
  contractName: 'auction',
  contractAddress: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  network: 'preview',
  transactionHash: '000000000000000000000000000000000000000000000000000000000000000000',
  deployedAt: '2026-08-03T18:00:00.000Z',
};

describe('Sealed Procurement Room production configuration', () => {
  it('accepts matching Preview deployment evidence', () => {
    expect(verifyProcurementDeployment(deployment).contractName).toBe('auction');
  });

  it('rejects evidence copied from another project', () => {
    expect(() => verifyProcurementDeployment({ ...deployment, contractName: 'foreign_contract' })).toThrow(/different contract/);
  });

  it('rejects malformed contract and transaction identifiers', () => {
    expect(() => verifyProcurementDeployment({ ...deployment, contractAddress: 'preview1bad' })).toThrow(/32-byte/);
    expect(() => verifyProcurementDeployment({ ...deployment, transactionHash: 'pending' })).toThrow(/transaction evidence/);
  });

  it('prevents demo mode and network drift in production', () => {
    expect(() => validateProcurementDeploymentRuntime({ networkId: 'preprod' })).toThrow(/Preview/);
    expect(() => validateProcurementDeploymentRuntime({ production: true, demoMode: 'true' })).toThrow(/forbidden/);
  });
});

