// Simuliert den kompletten Ablauf lokal (ohne Netzwerk, ohne Beweiserzeugung).
// Ausführen: npx tsx test/simulation.test.ts
import * as rt from '@midnight-ntwrk/compact-runtime';
import { strict as assert } from 'node:assert';
import { Status, pureCircuits } from '../build/contract/index.js';
import { createHarness, expectFail, b32, pad32, roleKey } from './harness.js';

// Rollen = verschiedene geheime Schlüssel
const skAdmin = b32(), skPruefstelle = b32(), skBauer = b32(), skSchlachthof = b32();
const { ps, now, call, L } = await createHarness(skAdmin);

// --- Governance ---------------------------------------------------------------
await call('addVerifier', skAdmin, roleKey(skPruefstelle));
await expectFail(call('addVerifier', skBauer, roleKey(skBauer)), 'Nur Admin');

const oracleSk = rt.sampleJubjubSchnorrSk();
const oracleId = pad32('telematik-anbieter-1');
await call('addOracleKey', skAdmin, oracleId, rt.jubjubSchnorrVerifyingKey(oracleSk));

// --- Prüfstelle bestätigt zwei Betriebe (Geburt + Mast) -----------------------
const mkEst = () => ({ active: true, hitRegNumber: b32(), geoHash: b32() });
const est = [mkEst(), mkEst()];
const claims = est.map(e => ({
  hitRegNumber: e.hitRegNumber, geoHash: e.geoHash,
  deforestationFree: true, legallyProduced: true, validUntil: BigInt(now + 365 * 86400),
}));
const salts = claims.map(() => b32());

const commitClaim = (c: typeof claims[0], salt: Uint8Array) => pureCircuits.attestationLeaf(c, salt);
for (let i = 0; i < 2; i++) await call('publishAttestation', skPruefstelle, commitClaim(claims[i], salts[i]));
await expectFail(call('publishAttestation', skBauer, b32()), 'Keine zugelassene Pruefstelle');

// --- Bauer registriert Charge -------------------------------------------------
const batchId = pad32('SSCC:340123450000000017');
const empty = { active: false, hitRegNumber: new Uint8Array(32), geoHash: new Uint8Array(32) };
ps.batches[Buffer.from(batchId).toString('hex')] = {
  secrets: { establishments: [...est, empty, empty], netWeightKg: 412n,
             purchasePriceCents: 189_900n, supplierRef: pad32('LIEF-0815') },
  salt: b32(),
  attestations: [{ claim: claims[0], salt: salts[0] }, { claim: claims[1], salt: salts[1] }, null, null],
};
const THRESH_7C = 10700n; // 7,00 °C
await call('registerBatch', skBauer, batchId, b32(), THRESH_7C);
assert.equal(L().status.lookup(batchId), Status.HARVESTED);
assert.equal(L().isQualityCertified.lookup(batchId), true);

// --- EUDR-Beweis --------------------------------------------------------------
await expectFail(call('proveEudrCompliance', skSchlachthof, batchId, BigInt(now)), 'Nicht der Halter');
await call('proveEudrCompliance', skBauer, batchId, BigInt(now - 60));
assert.equal(L().eudrProven.lookup(batchId), true);
console.log('✓ EUDR-Beweis akzeptiert, ohne Betriebe/Geodaten offenzulegen');

// Manipulation: Bauer behauptet einen dritten, nicht geprüften Betrieb
const rec = ps.batches[Buffer.from(batchId).toString('hex')];
const echteSecrets = rec.secrets;
rec.secrets = { ...echteSecrets, establishments: [...est, mkEst(), empty] };
await expectFail(call('proveEudrCompliance', skBauer, batchId, BigInt(now)), 'Commitment');
rec.secrets = echteSecrets;
console.log('✓ Untergeschobene Privatdaten werden abgelehnt');

// --- Mindestmenge (Range Proof) -----------------------------------------------
await call('proveMinWeight', skBauer, batchId, 400n);
await expectFail(call('proveMinWeight', skBauer, batchId, 500n), 'Mindestmenge');
console.log('✓ Range Proof: >= 400 kg bewiesen, exakt 412 kg bleibt privat');

// --- Halterwechsel ------------------------------------------------------------
const holderKey = (sk: Uint8Array) => pureCircuits.holderKey(sk, batchId);
await call('ship', skBauer, batchId, holderKey(skSchlachthof));
assert.equal(L().status.lookup(batchId), Status.IN_TRANSIT);

// --- Kühlkette ----------------------------------------------------------------
const msgFor = (temp: bigint, ts: bigint) => [
  rt.transientHash(new rt.CompactTypeBytes(32), pad32('agri:telemetry:v1')),
  rt.transientHash(new rt.CompactTypeBytes(32), batchId), temp, ts];
const VEC4F = new rt.CompactTypeVector(4, rt.CompactTypeField);
const ok = { tempEncoded: 10450n, timestamp: BigInt(now) };     // 4,5 °C
const bad = { tempEncoded: 10920n, timestamp: BigInt(now + 1) }; // 9,2 °C
const sig = (r: typeof ok) => rt.jubjubSchnorrSign(VEC4F, msgFor(r.tempEncoded, r.timestamp), oracleSk);

await expectFail(call('reportTemperatureBreach', skBauer, batchId, oracleId, ok, sig(ok)), 'Kein Grenzwertverstoss');
await expectFail(call('reportTemperatureBreach', skBauer, batchId, oracleId, bad, sig(ok)), 'Ungueltige');
await call('reportTemperatureBreach', skSchlachthof, batchId, oracleId, bad, sig(bad));
assert.equal(L().isQualityCertified.lookup(batchId), false);
console.log('✓ Signierte Grenzwertüberschreitung setzt isQualityCertified = false');

await call('acceptDelivery', skSchlachthof, batchId);
assert.equal(L().status.lookup(batchId), Status.DELIVERED);
assert.equal(L().isQualityCertified.lookup(batchId), false); // bleibt false
console.log('✓ Übergabe an Schlachthof; Qualitätsstatus bleibt unwiderruflich false');
console.log('\nAlle Tests bestanden.');
