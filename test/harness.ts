// Gemeinsame Testumgebung: lokaler Contract-Zustand, ohne Netzwerk und ohne
// Beweiserzeugung.
import * as rt from '@midnight-ntwrk/compact-runtime';
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { Contract, ledger } from '../build/contract/index.js';
import { witnesses, createPrivateState, type CattleTracePrivateState } from '../src/witnesses.js';

const COIN_PK = '0'.repeat(64);

export const b32 = () => new Uint8Array(randomBytes(32));
export const pad32 = (s: string) => { const o = new Uint8Array(32); o.set(new TextEncoder().encode(s)); return o; };
export const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

export const roleKey = (sk: Uint8Array) => rt.persistentHash(
  new rt.CompactTypeVector(2, new rt.CompactTypeBytes(32)), [pad32('agri:role:pk'), sk]);

export async function expectFail(p: Promise<unknown>, msg: string) {
  await assert.rejects(p, (e: any) => String(e?.message ?? e).includes(msg), `erwartet: ${msg}`);
}

/** Deployt den Contract lokal; skAdmin wird Admin. `now` = Blockzeit in Unix-Sekunden. */
export async function createHarness(skAdmin: Uint8Array, now = 1_790_000_000 /* Okt. 2026 */) {
  const contract = new Contract(witnesses);
  const addr = rt.sampleContractAddress();
  const ps: CattleTracePrivateState = createPrivateState(skAdmin);
  const init = await contract.initialState(rt.createConstructorContext(ps, COIN_PK));
  let state: any = init.currentContractState;

  // Rollen = verschiedene geheime Schlüssel; alle teilen sich hier einen Private State.
  async function call(name: string, sk: Uint8Array, ...args: any[]) {
    ps.secretKey = sk;
    const ctx = rt.createCircuitContext({
      circuitId: name, contractAddress: addr, coinPublicKeyOrZswapState: COIN_PK,
      contractState: state, privateState: ps, time: now,
    });
    const res = await (contract.impureCircuits as any)[name](ctx, ...args);
    state = res.context.queryContexts[addr]?.state ?? res.context.callContext.currentQueryContext.state;
    return res.result;
  }

  return { ps, now, call, L: () => ledger(state) };
}
