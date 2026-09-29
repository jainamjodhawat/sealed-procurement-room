export const contractName = 'auction';
export const target = 50;
const bytes = value => Uint8Array.from(Buffer.from(value, 'hex'));
const padded = value => { const result = new Uint8Array(32); result.set(new TextEncoder().encode(value)); return result; };
export function makePlan(pure, data) {
  const admin = bytes(data.adminSecret);
  const adminPk = pure.publicKey(admin);
  const id = bytes(data.id);
  const actors = data.actors.map((actor, index) => ({ secretKey: bytes(actor.secret), salt: bytes(actor.salt), index }));
  const steps = [];
  const add = (kind, circuit, state, args, verify) => steps.push({kind, circuit, state, args, verify});
  const adminState = {secretKey: admin, bidAmount: 1n, bidSalt: new Uint8Array(32)};
  for (const actor of actors.slice(0, target)) {
    const amount = BigInt(100 + actor.index);
    const state = {secretKey: actor.secretKey, bidAmount: amount, bidSalt: actor.salt};
    const commitment = pure.computeCommitment(amount, actor.salt, actor.secretKey);
    const pk = pure.publicKey(actor.secretKey);
    add('demo', 'submitCommitment', state, [commitment], live => live.commitments.member(pk) && Buffer.from(live.commitments.lookup(pk)).equals(Buffer.from(commitment)));
  }
  return {constructorArgs: [adminPk], adminState, steps};
}
export const witnessFields = ["localSecretKey","bidAmount","bidSalt"];
