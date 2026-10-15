// =============================================================================
//  witnesses.ts — Private Seite des EUDR-MVP
//
//  Läuft AUSSCHLIESSLICH lokal beim Betrieb bzw. Erstinverkehrbringer und
//  liefert die privaten Eingaben für den ZK-Beweis. Nichts davon verlässt das
//  Gerät, außer der Contract gibt es per disclose() frei.
// =============================================================================

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger, BatchSecrets, EstablishmentClaim, Witnesses } from '../build/contract/index.js';

export const SLOTS = 4;

/** Bestätigung, die eine Prüfstelle dem Betrieb off-chain übergibt. */
export interface ReceivedAttestation {
  claim: EstablishmentClaim;
  salt: Uint8Array; // 32 Byte Zufall, von der Prüfstelle erzeugt
}

export interface BatchPrivateRecord {
  secrets: BatchSecrets;                        // Betriebsliste (4 Slots)
  salt: Uint8Array;                             // 32 Byte Zufall für das Commitment
  attestations: (ReceivedAttestation | null)[]; // je Betriebs-Slot (Länge 4)
}

export interface EudrPrivateState {
  secretKey: Uint8Array;                       // 32 Byte, NIE teilen
  batches: Record<string, BatchPrivateRecord>; // key = hex(batchId)
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** Entspricht pad(32, "agri:dummy-leaf") im Contract. */
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

type Ctx = WitnessContext<Ledger, EudrPrivateState>;

function record(ctx: Ctx, batchId: Uint8Array): BatchPrivateRecord {
  const r = ctx.privateState.batches[hex(batchId)];
  if (!r) throw new Error(`Keine privaten Daten für Partie ${hex(batchId)}`);
  return r;
}

export const witnesses: Witnesses<EudrPrivateState> = {
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

  // Die Wallet sucht den Merkle-Pfad selbst im öffentlichen Ledger. Kein Server
  // erfährt, welches Leaf angefragt wurde. Für leere Slots: Pfad zum Dummy-Leaf.
  attestationPath: (ctx, leaf) => {
    const tree = ctx.ledger.attestations;
    const path = tree.findPathForLeaf(leaf) ?? tree.pathForLeaf(0n, DUMMY_LEAF);
    return [ctx.privateState, path];
  },
};

export const createPrivateState = (secretKey: Uint8Array): EudrPrivateState => {
  if (secretKey.length !== 32) throw new Error('secretKey muss 32 Byte haben');
  return { secretKey, batches: {} };
};
