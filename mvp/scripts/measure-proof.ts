// Misst, wie lange echte Zero-Knowledge-Beweise beim offiziellen Midnight-Proof-Server dauern.
//
// Voraussetzungen:
//   npm run compile    (voller Build mit Schlüsseln nach build/)
//   docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.3 midnight-proof-server --network preprod
// Ausführen:
//   npm run measure [-- <proof-server-url> <wiederholungen>]
//
// Der Ablauf läuft lokal (ohne Blockchain) mit den fiktiven Demo-Daten. Für jeden
// Schritt wird der echte Beweis beim Proof-Server bestellt, genau wie später auf Preprod.
import * as rt from '@midnight-ntwrk/compact-runtime';
import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { fileURLToPath } from 'node:url';
import { pureCircuits } from '../build/contract/index.js';
import { encodeBatchId } from '../src/encoding.js';
import { DEMO_FARMS, DEMO_BATCH_SSCC, establishmentOf, claimOf } from '../src/demo-data.js';
import { createHarness, b32, hex, roleKey } from '../test/harness.js';

const url = process.argv[2] ?? 'http://localhost:6300';
const runs = Number(process.argv[3] ?? 3);
const buildDir = fileURLToPath(new URL('../build', import.meta.url));
const prover = httpClientProvingProvider(url, new NodeZkConfigProvider(buildDir), { timeout: 600_000 });

// --- Ablauf lokal durchspielen und die Beweisdaten jedes Schritts sammeln -----
const skAdmin = b32(), skPruefstelle = b32(), skBetrieb = b32();
const { ps, now, call } = createHarness(skAdmin);
const steps: { label: string; circuit: string; res: rt.CircuitResults }[] = [];
const run = (label: string, circuit: string, sk: Uint8Array, ...args: any[]) =>
  steps.push({ label, circuit, res: call(circuit, sk, ...args) });

run('Admin lässt Prüfstelle zu', 'addVerifier', skAdmin, roleKey(skPruefstelle));
const att = [DEMO_FARMS.geburt, DEMO_FARMS.mast].map((farm) => ({ claim: claimOf(farm, BigInt(now) + 365n * 86400n), salt: b32() }));
for (const a of att) run('Prüfstelle veröffentlicht Bestätigung', 'publishAttestation', skPruefstelle, pureCircuits.attestationLeaf(a.claim, a.salt));
const EMPTY = { active: false, hitRegNumber: new Uint8Array(32), geoHash: new Uint8Array(32) };
const partie = encodeBatchId(DEMO_BATCH_SSCC);
ps.batches[hex(partie)] = {
  secrets: { establishments: [establishmentOf(DEMO_FARMS.geburt), establishmentOf(DEMO_FARMS.mast), EMPTY, EMPTY] },
  salt: b32(),
  attestations: [att[0], att[1], null, null],
};
run('Betrieb registriert Partie', 'registerBatch', skBetrieb, partie);
run('Entwaldungsnachweis (2 Betriebe)', 'proveEudrCompliance', skBetrieb, partie, BigInt(now - 60));

// --- Beweise beim Proof-Server bestellen ----------------------------------------
const preimage = ({ proofData: p }: rt.CircuitResults, circuit: string) =>
  rt.proofDataIntoSerializedPreimage(p.input, p.output, p.publicTranscript, p.privateTranscriptOutputs, circuit);

console.log(`Proof-Server: ${url}\n`);
const seen = new Set<string>();
for (const { label, circuit, res } of steps) {
  if (seen.has(circuit)) continue; // jede Funktion einmal messen
  seen.add(circuit);
  const pre = preimage(res, circuit);
  await prover.check(pre, circuit); // Server prüft, ob die Daten zum Circuit passen
  const n = circuit === 'proveEudrCompliance' ? runs : 1;
  const times: number[] = [];
  let size = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    size = (await prover.prove(pre, circuit)).length;
    times.push((performance.now() - t0) / 1000);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${label.padEnd(40)} ${avg.toFixed(1).padStart(6)} s  (Beweis: ${size} Byte${n > 1 ? `, ${n} Läufe: ${times.map((t) => t.toFixed(1)).join(' / ')} s` : ''})`);
}
