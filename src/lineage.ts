// =============================================================================
//  lineage.ts — Herkunftskette prüfen (für Abnehmer und Behörden)
//
//  Liest nur den ÖFFENTLICHEN Ledger. Nach Zerlegung oder Verarbeitung
//  erbt eine Ausgangscharge isQualityCertified zum Zeitpunkt der
//  Transformation. Wird eine Grenzwertüberschreitung für eine Eingangscharge
//  erst danach gemeldet, sieht man sie nur, wenn man die Kette zurückgeht.
// =============================================================================

import type { Ledger } from '../build/contract/index.js';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const isZero = (b: Uint8Array) => b.every((x) => x === 0);

/** Alle Vorfahren einer Charge (ohne die Charge selbst), bis zu den Ursprungschargen. */
export function ancestors(ledger: Ledger, batchId: Uint8Array): Uint8Array[] {
  const seen = new Set<string>();
  const out: Uint8Array[] = [];
  const stack = [batchId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (!ledger.inputBatches.member(id)) continue; // Ursprungscharge
    for (const parent of ledger.inputBatches.lookup(id)) {
      if (isZero(parent) || seen.has(hex(parent))) continue;
      seen.add(hex(parent));
      out.push(parent);
      stack.push(parent);
    }
  }
  return out;
}

/** true nur, wenn die Charge UND alle ihre Vorfahren isQualityCertified sind. */
export function qualityCertifiedWithLineage(ledger: Ledger, batchId: Uint8Array): boolean {
  return [batchId, ...ancestors(ledger, batchId)].every((id) => ledger.isQualityCertified.lookup(id));
}
