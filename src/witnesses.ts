// =============================================================================
//  witnesses.ts — Private Seite von CattleTrace
//
//  Diese Funktionen laufen AUSSCHLIESSLICH lokal (Wallet/Backend des Halters).
//  Sie liefern die privaten Eingaben für den ZK-Beweis. Was hier steht,
//  verlässt das Gerät nur, wenn der Contract es per disclose() freigibt.
//
//  Die PrivateState-Daten sollten im Midnight Private State Provider
//  (verschlüsselt) gespeichert werden, nicht im Klartext.
// =============================================================================

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type {
  Ledger,
  BatchSecrets,
  Establishment,
  EstablishmentClaim,
  Witnesses,
} from '../build/contract/index.js';

/** Bestätigung, die eine Prüfstelle dem Landwirt off-chain übergibt. */
export interface ReceivedAttestation {
  claim: EstablishmentClaim;
  salt: Uint8Array; // 32 Byte, zufällig, von der Prüfstelle erzeugt
}

export interface BatchPrivateRecord {
  secrets: BatchSecrets;          // Betriebe, Gewicht, Preis, Lieferant
  salt: Uint8Array;               // 32 Byte Zufall für das Commitment
  attestations: (ReceivedAttestation | null)[]; // je Betriebs-Slot (Länge 4)
}

export interface CattleTracePrivateState {
  secretKey: Uint8Array;                     // 32 Byte, NIE teilen
  batches: Record<string, BatchPrivateRecord>; // key = hex(batchId)
}

const SLOTS = 4;
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** Entspricht pad(32, "agri:dummy-leaf") im Contract (rechts mit 0 aufgefüllt). */
const DUMMY_LEAF = (() => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode('agri:dummy-leaf'));
  return out;
})();

const EMPTY_CLAIM: EstablishmentClaim = {
  hitRegNumber: new Uint8Array(32),
  geoHash: new Uint8Array(32),
  deforestationFree: false,
  legallyProduced: false,
  validUntil: 0n,
};

type Ctx = WitnessContext<Ledger, CattleTracePrivateState>;

function record(ctx: Ctx, batchId: Uint8Array): BatchPrivateRecord {
  const r = ctx.privateState.batches[hex(batchId)];
  if (!r) throw new Error(`Keine privaten Daten für Charge ${hex(batchId)}`);
  return r;
}

export const witnesses: Witnesses<CattleTracePrivateState> = {
  localSecretKey: (ctx) => [ctx.privateState, ctx.privateState.secretKey],

  batchSecrets: (ctx, batchId) => [ctx.privateState, record(ctx, batchId).secrets],

  batchSalt: (ctx, batchId) => [ctx.privateState, record(ctx, batchId).salt],

  attestationClaim: (ctx, batchId, slot) => {
    const a = record(ctx, batchId).attestations[Number(slot)];
    return [ctx.privateState, a?.claim ?? EMPTY_CLAIM];
  },

  attestationSalt: (ctx, batchId, slot) => {
    const a = record(ctx, batchId).attestations[Number(slot)];
    return [ctx.privateState, a?.salt ?? new Uint8Array(32)];
  },

  // Sucht den Merkle-Pfad im ÖFFENTLICHEN Ledger, aber lokal: Die Wallet
  // liest den Baum und berechnet den Pfad selbst. Kein Server erfährt,
  // welches Leaf angefragt wurde. Für leere Slots: Pfad zum Dummy-Leaf.
  attestationPath: (ctx, leaf) => {
    const tree = ctx.ledger.attestations;
    const path = tree.findPathForLeaf(leaf) ?? tree.pathForLeaf(0n, DUMMY_LEAF);
    return [ctx.privateState, path];
  },
};

export const createPrivateState = (secretKey: Uint8Array): CattleTracePrivateState => {
  if (secretKey.length !== 32) throw new Error('secretKey muss 32 Byte haben');
  return { secretKey, batches: {} };
};

// --- Private Datensätze für Zerlegung und Verarbeitung -----------------------
// Vor splitBatch/mergeBatches unter dem Schlüssel hex(childId) in
// privateState.batches ablegen.

/** Gewicht, Preis, Lieferant einer Ausgangscharge (die Betriebe regelt der Contract). */
export type OutputData = Omit<BatchSecrets, 'establishments'>;

const EMPTY_ESTABLISHMENT: Establishment = {
  active: false,
  hitRegNumber: new Uint8Array(32),
  geoHash: new Uint8Array(32),
};

const randomSalt = () => crypto.getRandomValues(new Uint8Array(32));

/**
 * Teilstück aus einer Zerlegung. Betriebe und Prüfstellen-Bestätigungen
 * werden von der Ausgangscharge übernommen (der Contract erzwingt das), damit
 * das Teilstück später auch selbst einen EUDR-Beweis führen kann.
 */
export const splitRecord = (parent: BatchPrivateRecord, data: OutputData): BatchPrivateRecord => ({
  secrets: { ...data, establishments: parent.secrets.establishments },
  salt: randomSalt(),
  attestations: parent.attestations,
});

/** Mischcharge: keine eigene Betriebsliste (der Contract erzwingt das). */
export const mergeRecord = (data: OutputData): BatchPrivateRecord => ({
  secrets: { ...data, establishments: Array(SLOTS).fill(EMPTY_ESTABLISHMENT) },
  salt: randomSalt(),
  attestations: Array(SLOTS).fill(null),
});

export { SLOTS };
