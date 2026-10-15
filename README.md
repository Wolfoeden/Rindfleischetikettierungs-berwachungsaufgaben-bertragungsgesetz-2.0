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
| Herkunftskette: welche Charge in welche überging | Gewichte von Teilstücken und Mischungen |

## Rollen

* **Admin/Konsortium** – lässt Prüfstellen und Telematik-Schlüssel zu (Produktiv: Multisig).
* **Prüfstelle** – prüft Betriebe off-chain (Satellit, Rechtskonformität) und veröffentlicht nur ein Commitment.
* **Erstinverkehrbringer** – registriert die Charge, bindet Privatdaten per Commitment.
* **Schlachthof/Zerlegebetrieb/Verarbeiter** – zerlegt Chargen in Teilstücke und mischt sie (z. B. zu Hackfleisch).
* **Telematik-Anbieter** – signiert Messwerte (Schnorr/Jubjub). Jeder kann eine signierte Überschreitung einreichen.
* **Abnehmer/Behörde** – liest `eudrProven`, `isQualityCertified`, prüft DDS-Referenz durch Nachrechnen und die Herkunftskette mit `src/lineage.ts`.

## Zerlegung und Verarbeitung

Entspricht den EPCIS-Transformation-Events. Eingangschargen bekommen den Status `CONSUMED`. Die Ausgangschargen werden neu angelegt, und der Aufrufer wird ihr Halter.

* **`splitBatch`**: zerlegt 1 Charge in 1 bis 4 Teilstücke. Mehr Teilstücke entstehen, indem man die Teilstücke weiter zerlegt. Jedes Teilstück übernimmt die Betriebsliste und kann deshalb später selbst einen EUDR-Beweis führen.
* **`mergeBatches`**: mischt 2 bis 4 Chargen zu einer neuen Charge, z. B. Hackfleisch. Größere Mischungen entstehen, indem man Mischchargen weiter mischt. Eine Mischcharge hat keine eigene Betriebsliste. Ihre Herkunft ergibt sich nur aus den Eingangschargen.
* **Mengenbilanz:** Die Ausgänge dürfen zusammen nicht schwerer sein als die Eingänge. Der Contract prüft das im Beweis gegen die privaten Gewichte. Öffentlich wird nur, dass die Bilanz aufgeht. Eine Charge kann nicht zweimal in eine Bilanz eingehen.
* **Vererbung:**
  * `eudrProven` gilt nur, wenn alle Eingänge bewiesen sind. Als Stichtag zählt der älteste.
  * `isQualityCertified` gilt nur, wenn alle Eingänge zum Zeitpunkt der Transformation zertifiziert sind.
  * Der Kühlgrenzwert darf nur strenger werden.
  * Bei einer Zerlegung wird das DDS-Commitment übernommen. Bei einer Mischung bindet ein neues Commitment die DDS-Referenzen aller Eingänge.

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
4. **Max. 4 Haltungsbetriebe** pro Charge und max. 4 Ein- bzw. Ausgänge pro Transformation (feste Circuit-Größe). Größere Mengen entstehen durch wiederholte Transformationen. Erweiterbar.
5. **Erst beweisen, dann mischen.** Ist ein Eingang beim Mischen noch nicht EUDR-bewiesen, bleibt die Mischcharge dauerhaft unbewiesen.
6. **Spät gemeldete Überschreitungen** an einer schon verarbeiteten Charge ändern die Ausgangschargen nicht automatisch. Abnehmer prüfen deshalb mit `qualityCertifiedWithLineage` (`src/lineage.ts`) die ganze Kette.
7. **Die Herkunftskette ist öffentlich**, wie im EPCIS-Standard. Wer die Chargen-IDs kennt, sieht, welche Teilstücke aus welchem Tier stammen. Mengen, Preise und Betriebe bleiben privat.
8. **Kein Audit.** Vor Produktivbetrieb ist ein externes Sicherheits-Audit nötig.
9. **Keine Rechtsberatung.** Die Abbildung der EUDR-Pflichten ist mit Fachjuristen zu prüfen.
