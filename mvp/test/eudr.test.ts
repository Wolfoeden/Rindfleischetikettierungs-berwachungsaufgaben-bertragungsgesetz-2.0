// EUDR-MVP: kompletter Ablauf mit (fiktiven) Demo-Daten, lokal ohne Netzwerk.
// Ausführen: npm test
import { strict as assert } from 'node:assert';
import { pureCircuits } from '../build/contract/index.js';
import { encodeBatchId } from '../src/encoding.js';
import { DEMO_FARMS, DEMO_BATCH_SSCC, establishmentOf, claimOf } from '../src/demo-data.js';
import type { BatchPrivateRecord, ReceivedAttestation } from '../src/witnesses.js';
import { createHarness, expectFail, b32, hex, roleKey } from './harness.js';

const skAdmin = b32(), skPruefstelle = b32(), skBetrieb = b32(), skFremd = b32();
const { ps, now, call, L } = createHarness(skAdmin);
const YEAR = 365n * 86400n;
const EMPTY = { active: false, hitRegNumber: new Uint8Array(32), geoHash: new Uint8Array(32) };

// --- 1. Admin lässt eine Prüfstelle zu ------------------------------------------
call('addVerifier', skAdmin, roleKey(skPruefstelle));
expectFail(() => call('addVerifier', skFremd, roleKey(skFremd)), 'Nur Admin');
console.log('✓ Admin lässt Prüfstelle zu; sonst niemand');

// --- 2. Prüfstelle bestätigt Geburts- und Mastbetrieb ---------------------------
function attest(farm: typeof DEMO_FARMS.geburt, validUntil = BigInt(now) + YEAR): ReceivedAttestation {
  const a = { claim: claimOf(farm, validUntil), salt: b32() };
  call('publishAttestation', skPruefstelle, pureCircuits.attestationLeaf(a.claim, a.salt));
  return a; // geht off-chain an den Betrieb
}
const attGeburt = attest(DEMO_FARMS.geburt);
const attMast = attest(DEMO_FARMS.mast);
expectFail(() => call('publishAttestation', skFremd, b32()), 'Keine zugelassene Pruefstelle');
console.log('✓ Prüfstelle veröffentlicht nur Fingerabdrücke ihrer Bestätigungen');

// --- 3. Erstinverkehrbringer registriert eine Partie ----------------------------
function register(sscc: string, record: BatchPrivateRecord) {
  const id = encodeBatchId(sscc);
  ps.batches[hex(id)] = record;
  call('registerBatch', skBetrieb, id);
  return id;
}
const partie = register(DEMO_BATCH_SSCC, {
  secrets: { establishments: [establishmentOf(DEMO_FARMS.geburt), establishmentOf(DEMO_FARMS.mast), EMPTY, EMPTY] },
  salt: b32(),
  attestations: [attGeburt, attMast, null, null],
});
assert.equal(L().eudrProven.lookup(partie), false);
expectFail(() => call('registerBatch', skBetrieb, partie), 'Partie existiert bereits');
expectFail(() => call('registerBatch', skBetrieb, new Uint8Array(32)), 'Ungueltige Partie-ID');

// --- 4. Entwaldungsnachweis -----------------------------------------------------
const asOf = BigInt(now - 60);
expectFail(() => call('proveEudrCompliance', skFremd, partie, asOf), 'Nicht der Halter');
expectFail(() => call('proveEudrCompliance', skBetrieb, partie, BigInt(now + 3600)), 'Zukunft');
expectFail(() => call('proveEudrCompliance', skBetrieb, partie, BigInt(now - 2 * 86400)), 'zu alt');
call('proveEudrCompliance', skBetrieb, partie, asOf);
assert.equal(L().eudrProven.lookup(partie), true);
assert.equal(L().eudrProvenAsOf.lookup(partie), asOf);
console.log('✓ Partie mit 2 bestätigten Betrieben: Haken "entwaldungsfrei" gesetzt');

// --- 5. Was öffentlich ist: keine Registriernummer, keine Koordinaten -----------
const secretBytes = [DEMO_FARMS.geburt, DEMO_FARMS.mast].flatMap((f) => {
  const e = establishmentOf(f);
  return [hex(e.hitRegNumber).replace(/(00)+$/, ''), hex(e.geoHash)];
});
const publicValues = [
  ...[...L().secretsCommitment].map(([k, v]) => hex(k) + hex(v)),
  ...[...L().holder].map(([k, v]) => hex(k) + hex(v)),
  hex(L().admin),
  ...[...L().verifiers].map(hex),
].join('');
for (const s of secretBytes) assert.ok(!publicValues.includes(s), 'Klartext im öffentlichen Zustand gefunden');
console.log('✓ Öffentlich: nur Fingerabdrücke und Haken, keine Registriernummer, keine Koordinaten');

// --- 6. Negativfälle ------------------------------------------------------------
const rec = ps.batches[hex(partie)];

// a) Betriebsliste nachträglich vertauschen
const echt = rec.secrets;
rec.secrets = { establishments: [establishmentOf(DEMO_FARMS.geburt), establishmentOf(DEMO_FARMS.ungeprueft), EMPTY, EMPTY] };
expectFail(() => call('proveEudrCompliance', skBetrieb, partie, asOf), 'Commitment');
rec.secrets = echt;
console.log('✓ Nachträglich vertauschte Betriebe werden abgelehnt');

// b) Partie mit einem ungeprüften Betrieb
const mitUngeprueft = register('340123450000000024', {
  secrets: { establishments: [establishmentOf(DEMO_FARMS.geburt), establishmentOf(DEMO_FARMS.ungeprueft), EMPTY, EMPTY] },
  salt: b32(),
  attestations: [attGeburt, null, null, null],
});
expectFail(() => call('proveEudrCompliance', skBetrieb, mitUngeprueft, asOf), 'EUDR-Nachweis fuer einen Betrieb fehlgeschlagen');

// c) Selbst ausgestellte Bestätigung (nie von einer Prüfstelle veröffentlicht)
ps.batches[hex(mitUngeprueft)].attestations[1] = { claim: claimOf(DEMO_FARMS.ungeprueft, BigInt(now) + YEAR), salt: b32() };
expectFail(() => call('proveEudrCompliance', skBetrieb, mitUngeprueft, asOf), 'EUDR-Nachweis fuer einen Betrieb fehlgeschlagen');
assert.equal(L().eudrProven.lookup(mitUngeprueft), false);
console.log('✓ Ungeprüfter Betrieb oder selbst ausgestellte Bestätigung: kein Haken');

// d) Abgelaufene Bestätigung
const attAlt = attest(DEMO_FARMS.mast, BigInt(now - 86400));
const mitAbgelaufen = register('340123450000000031', {
  secrets: { establishments: [establishmentOf(DEMO_FARMS.mast), EMPTY, EMPTY, EMPTY] },
  salt: b32(),
  attestations: [attAlt, null, null, null],
});
expectFail(() => call('proveEudrCompliance', skBetrieb, mitAbgelaufen, asOf), 'EUDR-Nachweis fuer einen Betrieb fehlgeschlagen');
console.log('✓ Abgelaufene Bestätigung: kein Haken');

// e) Entzogene Zulassung
call('removeVerifier', skAdmin, roleKey(skPruefstelle));
expectFail(() => attest(DEMO_FARMS.ungeprueft), 'Keine zugelassene Pruefstelle');
console.log('✓ Prüfstelle ohne Zulassung kann nichts mehr bestätigen');

console.log('\nAlle MVP-Tests bestanden.');
