// Lokale Testumgebung: Contract-Zustand im Speicher, ohne Netzwerk.
import * as rt from '@midnight-ntwrk/compact-runtime';
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { Contract, ledger } from '../build/contract/index.js';
import { witnesses, createPrivateState, type EudrPrivateState } from '../src/witnesses.js';

const COIN_PK = '0'.repeat(64);

export const b32 = () => new Uint8Array(randomBytes(32));
export const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const pad32 = (s: string) => { const o = new Uint8Array(32); o.set(new TextEncoder().encode(s)); return o; };

/** Öffentlicher Schlüssel einer Rolle (Admin, Prüfstelle), wie roleKey() im Contract. */
export const roleKey = (sk: Uint8Array) => rt.persistentHash(
  new rt.CompactTypeVector(2, new rt.CompactTypeBytes(32)), [pad32('agri:role:pk'), sk]);

export function expectFail(fn: () => unknown, msg: string) {
  assert.throws(fn, (e: any) => String(e?.message ?? e).includes(msg), `erwartet: ${msg}`);
}

/** Deployt den Contract lokal; skAdmin wird Admin. `now` = Blockzeit in Unix-Sekunden. */
export function createHarness(skAdmin: Uint8Array, now = 1_790_000_000 /* Okt. 2026 */) {
  const contract = new Contract(witnesses);
  const address = rt.sampleContractAddress();
  const ps: EudrPrivateState = createPrivateState(skAdmin);
  let state: any = contract.initialState(rt.createConstructorContext(ps, COIN_PK)).currentContractState.data;

  // Rollen = verschiedene geheime Schlüssel; alle teilen sich hier einen Private State.
  function call(name: string, sk: Uint8Array, ...args: any[]): rt.CircuitResults<EudrPrivateState, any> {
    ps.secretKey = sk;
    const ctx = rt.createCircuitContext(address, COIN_PK, state, ps, undefined, undefined, now);
    const res = (contract.impureCircuits as any)[name](ctx, ...args);
    state = res.context.currentQueryContext.state;
    return res;
  }

  return { ps, now, call, L: () => ledger(state), state: () => state };
}
