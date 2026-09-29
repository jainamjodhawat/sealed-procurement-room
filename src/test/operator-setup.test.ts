import { expect, it } from 'vitest';
import { hex32, prepareOperatorArgument } from '../OperatorSetup';
it('rejects malformed administrator credentials', () => {
  expect(()=>hex32('not a key')).toThrow(/64 hexadecimal/);
  expect(hex32('ab'.repeat(32))).toHaveLength(32);
});


