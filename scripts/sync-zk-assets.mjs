import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('contracts/managed/auction');
const target = resolve('public/midnight/auction');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await Promise.all([
  cp(resolve(source, 'keys'), resolve(target, 'keys'), { recursive: true }),
  cp(resolve(source, 'zkir'), resolve(target, 'zkir'), { recursive: true }),
]);

console.log('Procurement bid circuits staged.');
