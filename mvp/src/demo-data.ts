// =============================================================================
//  demo-data.ts — DEMO-DATEN, FIKTIV
//
//  Die Betriebe gibt es nicht: Der Landesschlüssel 99 in den Registriernummern
//  existiert in Deutschland nicht. Die Koordinaten sind beliebige Punkte in
//  landwirtschaftlich geprägten Regionen Niedersachsens und gehören zu keinem
//  bestimmten Betrieb. Nicht als echte Prüfergebnisse verwenden.
// =============================================================================

import type { Establishment, EstablishmentClaim } from '../build/contract/index.js';
import { encodeGeoPoint, encodeHitRegNumber } from './encoding.js';

export interface Farm {
  name: string;
  hit: string;  // HI-Tier-Registriernummer
  lat: number;  // WGS 84
  lon: number;
}

export const DEMO_FARMS = {
  geburt: { name: 'Demo-Hof Geburt (fiktiv)', hit: '276 99 001 001 0001', lat: 52.8512, lon: 8.0473 },
  mast: { name: 'Demo-Hof Mast (fiktiv)', hit: '276 99 002 004 0002', lat: 52.7356, lon: 8.2819 },
  // Für den Negativfall: Diesen Betrieb hat keine Prüfstelle bestätigt.
  ungeprueft: { name: 'Demo-Hof ohne Prüfung (fiktiv)', hit: '276 99 003 007 0003', lat: 53.0714, lon: 7.4028 },
} satisfies Record<string, Farm>;

/** Beispiel-SSCC für eine Partie (18 Ziffern). */
export const DEMO_BATCH_SSCC = '340123450000000017';

export const establishmentOf = (farm: Farm): Establishment => ({
  active: true,
  hitRegNumber: encodeHitRegNumber(farm.hit),
  geoHash: encodeGeoPoint(farm.lat, farm.lon),
});

/** Bestätigung, wie eine Prüfstelle sie nach erfolgreicher Prüfung ausstellt. */
export const claimOf = (farm: Farm, validUntil: bigint): EstablishmentClaim => ({
  hitRegNumber: encodeHitRegNumber(farm.hit),
  geoHash: encodeGeoPoint(farm.lat, farm.lon),
  deforestationFree: true,
  legallyProduced: true,
  validUntil,
});
