// Zerlegung und Verarbeitung (EPCIS Transformation Events) mit Mengenbilanz.
// Ausführen: npx tsx test/transformation.test.ts
import * as rt from '@midnight-ntwrk/compact-runtime';
import { strict as assert } from 'node:assert';
import { Status, pureCircuits } from '../build/contract/index.js';
import { splitRecord, mergeRecord, type BatchPrivateRecord } from '../src/witnesses.js';
import { ancestors, qualityCertifiedWithLineage } from '../src/lineage.js';
import { createHarness, expectFail, b32, pad32, hex, roleKey } from './harness.js';

const skAdmin = b32(), skPruefstelle = b32(), skBauer1 = b32(), skBauer2 = b32(), skSchlachthof = b32();
const { ps, now, call, L } = await createHarness(skAdmin);
await call('addVerifier', skAdmin, roleKey(skPruefstelle));
const oracleSk = rt.sampleJubjubSchnorrSk();
const oracleId = pad32('telematik-anbieter-1');
await call('addOracleKey', skAdmin, oracleId, rt.jubjubSchnorrVerifyingKey(oracleSk));

const ZERO = new Uint8Array(32);
const T7 = 10700n, T3 = 10300n, T2 = 10200n; // 7 °C Fleisch, 3 °C Nebenprodukte, 2 °C Hackfleisch
const out = (kg: bigint) => ({ netWeightKg: kg, purchasePriceCents: 0n, supplierRef: pad32('intern') });
const rec = (id: Uint8Array) => ps.batches[hex(id)];
const put = (id: Uint8Array, r: BatchPrivateRecord) => { ps.batches[hex(id)] = r; };

// --- Zwei Rinder: geprüft, EUDR-bewiesen, an den Schlachthof geliefert -------
async function rind(id: Uint8Array, sk: Uint8Array, kg: bigint, betriebe: number, asOf: bigint) {
  const empty = { active: false, hitRegNumber: ZERO, geoHash: ZERO };
  const est = Array.from({ length: betriebe }, () => ({ active: true, hitRegNumber: b32(), geoHash: b32() }));
  const att = est.map((e) => ({
    claim: { hitRegNumber: e.hitRegNumber, geoHash: e.geoHash, deforestationFree: true,
             legallyProduced: true, validUntil: BigInt(now + 365 * 86400) },
    salt: b32(),
  }));
  for (const a of att) await call('publishAttestation', skPruefstelle, pureCircuits.attestationLeaf(a.claim, a.salt));
  const pad = <T>(xs: T[], fill: T) => [...xs, ...Array(4 - xs.length).fill(fill)];
  put(id, {
    secrets: { establishments: pad(est, empty), netWeightKg: kg, purchasePriceCents: 189_900n, supplierRef: pad32('LIEF-0815') },
    salt: b32(),
    attestations: pad<BatchPrivateRecord['attestations'][0]>(att, null),
  });
  await call('registerBatch', sk, id, b32(), T7);
  await call('proveEudrCompliance', sk, id, asOf);
  await call('ship', sk, id, pureCircuits.holderKey(skSchlachthof, id));
}

const rindA = pad32('SSCC:340123450000000017'), rindB = pad32('SSCC:340123450000000024');
await rind(rindA, skBauer1, 412n, 2, BigInt(now - 60));
await rind(rindB, skBauer2, 380n, 1, BigInt(now - 3600));

// Unterwegs darf noch niemand zerlegen
put(pad32('X'), splitRecord(rec(rindA), out(1n)));
await expectFail(call('splitBatch', skBauer1, rindA, [pad32('X'), ZERO, ZERO, ZERO], [T7, 0n, 0n, 0n], 1n), 'unterwegs');
await call('acceptDelivery', skSchlachthof, rindA);
await call('acceptDelivery', skSchlachthof, rindB);

// --- Zerlegung: Rind A (412 kg) -> Rücken, Keule, Nebenprodukte -------------
const ruecken = pad32('SSCC:A-RUECKEN'), keule = pad32('SSCC:A-KEULE'), neben = pad32('SSCC:A-NEBEN');
const kinderA = [ruecken, keule, neben, ZERO];
const setA = (kg: bigint[]) => [ruecken, keule, neben].forEach((id, i) => put(id, splitRecord(rec(rindA), out(kg[i]))));

setA([200n, 150n, 100n]); // 450 kg > 412 kg
await expectFail(call('splitBatch', skSchlachthof, rindA, kinderA, [T7, T7, T3, 0n], 3n), 'Mengenbilanz verletzt');
console.log('✓ Zerlegung: Teilstücke schwerer als das Rind werden abgelehnt (450 kg > 412 kg)');

setA([150n, 120n, 40n]); // 310 kg <= 412 kg, Rest = Knochen, Abschnitte
await expectFail(call('splitBatch', skBauer1, rindA, kinderA, [T7, T7, T3, 0n], 3n), 'Nicht der Halter');
await expectFail(call('splitBatch', skSchlachthof, rindA, kinderA, [T7, 10800n, T3, 0n], 3n), 'Kuehlgrenzwert');
put(ZERO, splitRecord(rec(rindA), out(1n)));
await expectFail(call('splitBatch', skSchlachthof, rindA, [ruecken, ZERO, ZERO, ZERO], [T7, T7, 0n, 0n], 2n), 'Ungueltige Chargen-ID');
delete ps.batches[hex(ZERO)];
const echteKeule = rec(keule);
put(keule, { ...echteKeule, secrets: { ...echteKeule.secrets, establishments: rec(rindB).secrets.establishments } });
await expectFail(call('splitBatch', skSchlachthof, rindA, kinderA, [T7, T7, T3, 0n], 3n), 'Betriebe der Ausgangscharge');
put(keule, echteKeule);
console.log('✓ Zerlegung: fremde Betriebe und laxere Kühlgrenzwerte werden abgelehnt');

await call('splitBatch', skSchlachthof, rindA, kinderA, [T7, T7, T3, 0n], 3n);
assert.equal(L().status.lookup(rindA), Status.CONSUMED);
for (const id of [ruecken, keule, neben]) {
  assert.equal(L().status.lookup(id), Status.HARVESTED);
  assert.equal(L().eudrProven.lookup(id), true);
  assert.equal(L().eudrProvenAsOf.lookup(id), BigInt(now - 60));
  assert.equal(L().isQualityCertified.lookup(id), true);
  assert.deepEqual(L().ddsCommitment.lookup(id), L().ddsCommitment.lookup(rindA));
  assert.deepEqual(L().inputBatches.lookup(id), [rindA, ZERO, ZERO, ZERO]);
}
assert.equal(L().tempThreshold.lookup(neben), T3);
assert.equal(L().inputBatches.member(rindA), false); // Ursprungscharge
console.log('✓ Zerlegung 412 kg -> 3 Teilstücke: EUDR-Status, Qualität, DDS vererbt; Gewichte bleiben privat');

await expectFail(call('splitBatch', skSchlachthof, rindA, kinderA, [T7, T7, T3, 0n], 3n), 'bereits verarbeitet');
await expectFail(call('ship', skSchlachthof, rindA, b32()), 'bereits verarbeitet');
console.log('✓ Verbrauchte Charge kann weder erneut zerlegt noch versendet werden');

// Teilstücke tragen die Betriebe weiter: eigener EUDR-Beweis und Range Proof möglich
await call('proveEudrCompliance', skSchlachthof, keule, BigInt(now));
await call('proveMinWeight', skSchlachthof, keule, 120n);
await expectFail(call('proveMinWeight', skSchlachthof, keule, 121n), 'Mindestmenge');
console.log('✓ Teilstück führt eigenen EUDR-Beweis und Range Proof (>= 120 kg)');

// --- Rind B (380 kg) -> zwei Hälften ----------------------------------------
const b1 = pad32('SSCC:B-1'), b2 = pad32('SSCC:B-2');
put(b1, splitRecord(rec(rindB), out(200n)));
put(b2, splitRecord(rec(rindB), out(150n)));
await call('splitBatch', skSchlachthof, rindB, [b1, b2, ZERO, ZERO], [T7, T7, 0n, 0n], 2n);

// --- Verarbeitung: Keule (120 kg) + B-1 (200 kg) -> Hackfleisch -------------
const hack = pad32('SSCC:HACK-1');
const hackInputs = [keule, b1, ZERO, ZERO];
const ddsListe = b32(); // Commitment auf die DDS-Referenzen beider Eingänge

put(hack, mergeRecord(out(330n))); // 330 kg > 320 kg
await expectFail(call('mergeBatches', skSchlachthof, hackInputs, 2n, hack, ddsListe, T2), 'Mengenbilanz verletzt');
put(hack, mergeRecord(out(300n)));
await expectFail(call('mergeBatches', skSchlachthof, [keule, keule, ZERO, ZERO], 2n, hack, ddsListe, T2), 'bereits verarbeitet');
console.log('✓ Verarbeitung: Mehrgewicht und doppelt gezählte Eingänge werden abgelehnt');

const echtesHack = rec(hack);
put(hack, { ...echtesHack, secrets: { ...echtesHack.secrets, establishments: rec(rindA).secrets.establishments } });
await expectFail(call('mergeBatches', skSchlachthof, hackInputs, 2n, hack, ddsListe, T2), 'keine eigenen Betriebe');
put(hack, echtesHack);
await expectFail(call('mergeBatches', skSchlachthof, hackInputs, 2n, hack, ddsListe, 10800n), 'Kuehlgrenzwert');

await call('mergeBatches', skSchlachthof, hackInputs, 2n, hack, ddsListe, T2);
assert.equal(L().status.lookup(keule), Status.CONSUMED);
assert.equal(L().status.lookup(b1), Status.CONSUMED);
assert.equal(L().eudrProven.lookup(hack), true);
assert.equal(L().eudrProvenAsOf.lookup(hack), BigInt(now - 3600)); // ältester Stichtag (Rind B)
assert.equal(L().isQualityCertified.lookup(hack), true);
assert.equal(L().tempThreshold.lookup(hack), T2);
assert.deepEqual(L().inputBatches.lookup(hack), hackInputs);
await expectFail(call('proveEudrCompliance', skSchlachthof, hack, BigInt(now)), 'Mindestens ein Betrieb');
console.log('✓ Verarbeitung 120 kg + 200 kg -> 300 kg Hackfleisch (2 °C), EUDR nur vererbt');

// --- Ohne EUDR-Beweis gemischt: Mischung ist nicht bewiesen -----------------
const rindC = pad32('SSCC:340123450000000031');
put(rindC, { ...rec(rindA), secrets: { ...rec(rindA).secrets, netWeightKg: 300n }, salt: b32() });
await call('registerBatch', skSchlachthof, rindC, b32(), T7); // kein proveEudrCompliance
const hack2 = pad32('SSCC:HACK-2');
put(hack2, mergeRecord(out(400n)));
await call('mergeBatches', skSchlachthof, [b2, rindC, ZERO, ZERO], 2n, hack2, b32(), T2);
assert.equal(L().eudrProven.lookup(hack2), false);
assert.equal(L().eudrProvenAsOf.member(hack2), false);
console.log('✓ Ein unbewiesener Eingang -> Mischcharge ist nicht EUDR-bewiesen');

// --- Nachträglich gemeldete Überschreitung an einer Vorfahren-Charge --------
const VEC4F = new rt.CompactTypeVector(4, rt.CompactTypeField);
const reading = { tempEncoded: 10920n, timestamp: BigInt(now - 1800) }; // 9,2 °C auf dem Transport
const msg = [rt.transientHash(new rt.CompactTypeBytes(32), pad32('agri:telemetry:v1')),
             rt.transientHash(new rt.CompactTypeBytes(32), rindB), reading.tempEncoded, reading.timestamp];
await call('reportTemperatureBreach', skBauer2, rindB, oracleId, reading, rt.jubjubSchnorrSign(VEC4F, msg, oracleSk));
assert.equal(L().isQualityCertified.lookup(rindB), false);
assert.equal(L().isQualityCertified.lookup(hack), true); // Flag allein reicht nicht ...
assert.deepEqual(new Set(ancestors(L(), hack).map(hex)), new Set([keule, b1, rindA, rindB].map(hex)));
assert.equal(qualityCertifiedWithLineage(L(), hack), false); // ... die Kette deckt es auf
assert.equal(qualityCertifiedWithLineage(L(), ruecken), true);
console.log('✓ Spät gemeldete Überschreitung an Rind B wird über die Herkunftskette erkannt');

console.log('\nAlle Transformations-Tests bestanden.');
