# Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz 2.0

**CattleTrace** – EUDR-konforme Rinder-Lieferkette auf Midnight

Open-Source-Referenz-Contract in **Compact** für die Rückverfolgung von Rindern und
Rindfleisch nach EU-Entwaldungsverordnung (EUDR) und GS1 EPCIS 2.0, mit
Zero-Knowledge-Beweisen statt offengelegter Betriebsdaten.

Getestet mit `compactc 0.35.0` (Sprache 0.27.0) und `@midnight-ntwrk/compact-runtime 0.20.0`.

## Was öffentlich ist, was privat bleibt

| Öffentlich (Ledger) | Privat (nur beim Halter) |
|---|---|
| Chargen-ID (SSCC/GTIN), Status | HIT-Registriernummern aller Haltungsbetriebe |
| Halter-Pseudonym (pro Charge neu) | Geolokalisierung der Betriebe |
| `isQualityCertified`, Temperatur-Grenzwert | exakte Menge, Einkaufspreis, Lieferant |
| `eudrProven` + Stichtag | welche Prüfstelle welchen Betrieb geprüft hat |
| Commitments (Privatdaten, DDS-Referenz) | einzelne Temperaturmesswerte |

## Rollen

* **Admin/Konsortium** – lässt Prüfstellen und Telematik-Schlüssel zu (Produktiv: Multisig).
* **Prüfstelle** – prüft Betriebe off-chain (Satellit, Rechtskonformität) und veröffentlicht nur ein Commitment.
* **Erstinverkehrbringer** – registriert die Charge, bindet Privatdaten per Commitment.
* **Telematik-Anbieter** – signiert Messwerte (Schnorr/Jubjub). Jeder kann eine signierte Überschreitung einreichen.
* **Abnehmer/Behörde** – liest `eudrProven`, `isQualityCertified`, prüft DDS-Referenz durch Nachrechnen.

## Schnellstart

```bash
npm install
npm run compile:fast   # schnell, ohne ZK-Schlüssel
npm test               # lokale Simulation des gesamten Ablaufs
npm run compile        # voller Build inkl. Proving/Verifier Keys (lädt SRS von srs.midnight.network)
```

## Bekannte Grenzen (bewusst dokumentiert)

1. **Behörden erhalten die Geodaten weiterhin** über die Sorgfaltserklärung im EU-Informationssystem. Der Datenschutzgewinn liegt zwischen Geschäftspartnern.
2. **Vertrauensanker sind Prüfstellen und Telematik-Anbieter.** Die Chain prüft Signaturen, nicht die physische Realität.
3. **Vollständigkeit der Messwerte** ist nicht erzwingbar; der Contract macht Unterdrückung nur schwer, weil jeder Datenempfänger einreichen kann.
4. **Max. 4 Haltungsbetriebe** pro Charge (feste Circuit-Größe). Erweiterbar.
5. **Kein Audit.** Vor Produktivbetrieb ist ein externes Sicherheits-Audit nötig.
6. **Keine Rechtsberatung.** Die Abbildung der EUDR-Pflichten ist mit Fachjuristen zu prüfen.
