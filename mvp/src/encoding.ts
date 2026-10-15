// =============================================================================
//  encoding.ts — Wie aus echten Betriebsdaten 32-Byte-Werte für den Contract werden
//
//  Prüfstelle und Betrieb müssen exakt dieselben Bytes berechnen, sonst passt
//  die Bestätigung nicht zum Betrieb. Deshalb ist das Format hier festgelegt
//  und versioniert (v1). Diese Werte sind PRIVAT: Sie landen nie im Klartext
//  on-chain, nur gesalzen in Commitments.
// =============================================================================

import { createHash } from 'node:crypto';

/**
 * Registriernummer eines Betriebs in HI-Tier (Viehverkehrsverordnung):
 * 15 Ziffern = 276 (Deutschland) + Land (2) + Kreis (3) + Gemeinde (3) + Betrieb (4).
 * Leerzeichen sind erlaubt und werden entfernt.
 *
 * Kodierung v1: die 15 ASCII-Ziffern, rechts mit Null-Bytes auf 32 Byte aufgefüllt.
 */
export function encodeHitRegNumber(hit: string): Uint8Array {
  const digits = hit.replace(/\s+/g, '');
  if (!/^276\d{12}$/.test(digits)) {
    throw new Error(`Ungültige HI-Tier-Registriernummer: "${hit}" (erwartet 15 Ziffern, beginnend mit 276)`);
  }
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(digits));
  return out;
}

/**
 * Geolokalisierung eines Betriebs nach EUDR: ein Koordinatenpunkt (WGS 84) mit
 * mindestens 6 Nachkommastellen. Für Rinder sind keine Flächen-Polygone nötig.
 *
 * Kodierung v1: SHA-256 über den UTF-8-Text "agri:geo:v1:<lat>,<lon>",
 * beide Werte mit genau 6 Nachkommastellen, z. B. "agri:geo:v1:52.851200,8.047300".
 */
export function encodeGeoPoint(lat: number, lon: number): Uint8Array {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`Ungültiger Breitengrad: ${lat}`);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error(`Ungültiger Längengrad: ${lon}`);
  const text = `agri:geo:v1:${lat.toFixed(6)},${lon.toFixed(6)}`;
  return new Uint8Array(createHash('sha256').update(text, 'utf8').digest());
}

/** Partie-ID, z. B. eine SSCC (18 Ziffern): ASCII, rechts mit Null-Bytes auf 32 Byte aufgefüllt. */
export function encodeBatchId(id: string): Uint8Array {
  const bytes = new TextEncoder().encode(id);
  if (bytes.length === 0 || bytes.length > 32) throw new Error(`Partie-ID muss 1 bis 32 Byte lang sein: "${id}"`);
  const out = new Uint8Array(32);
  out.set(bytes);
  return out;
}
