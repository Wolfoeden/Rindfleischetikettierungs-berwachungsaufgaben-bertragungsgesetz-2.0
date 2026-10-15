# EUDR-MVP: Entwaldungsnachweis ohne Offenlegung der Betriebe

Erster Use Case von CattleTrace, zugeschnitten auf eine Veröffentlichung auf Midnight.

Eine Prüfstelle bestätigt Betriebe. Ein Erstinverkehrbringer registriert eine Partie und beweist, dass alle Betriebe der Partie bestätigt sind. Danach trägt die Partie öffentlich den Haken „entwaldungsfrei“ mit Stichtag. Welche Betriebe beteiligt sind und wo sie liegen, bleibt privat.

Der Contract ist ein Ausschnitt aus `../src/CattleTrace.compact`, nur der EUDR-Teil. Transport, Kühlkette, Zerlegung und Mengen gehören nicht dazu.

## Versionen

Gebaut für den stabilen Midnight-Stand (Ledger 8), auf dem auch die offiziellen Beispiele auf Preprod laufen:

| Komponente | Version |
|---|---|
| Compact-Compiler | 0.31.0 (Sprache 0.23) |
| `@midnight-ntwrk/compact-runtime` | 0.16.0 |
| midnight-js | 4.1.1 |
| Proof-Server | `midnightntwrk/proof-server:8.1.3` |

Der Haupt-Contract im Repo-Wurzelverzeichnis nutzt dagegen Compiler 0.35.0 (Ledger 9, bisher nur als Release Candidate verfügbar).

## Ablauf

1. **Admin** lässt eine Prüfstelle zu (`addVerifier`).
2. **Prüfstelle** prüft einen Betrieb off-chain und veröffentlicht nur den Fingerabdruck ihrer Bestätigung (`publishAttestation`). Bestätigung und Salt gibt sie dem Betrieb off-chain.
3. **Erstinverkehrbringer** registriert die Partie und bindet die Betriebsliste per Commitment (`registerBatch`).
4. **Erstinverkehrbringer** erzeugt den Beweis lokal (`proveEudrCompliance`). Öffentlich wird nur `eudrProven = true` und der Stichtag.
5. **Käufer/Behörde** liest `eudrProven` und `eudrProvenAsOf` zur Partie-ID.

## Datenformat (`src/encoding.ts`, Version v1)

* **Betrieb:** HI-Tier-Registriernummer, 15 Ziffern (276 + Land + Kreis + Gemeinde + Betrieb), als ASCII auf 32 Byte aufgefüllt.
* **Standort:** ein Koordinatenpunkt (WGS 84). Für Rinder verlangt die EUDR keine Flächen-Polygone. Gespeichert wird SHA-256 über `agri:geo:v1:<lat>,<lon>` mit je 6 Nachkommastellen.
* **Partie:** z. B. SSCC, als ASCII auf 32 Byte aufgefüllt.

Diese Werte sind privat. On-chain erscheinen sie nur gesalzen in Commitments.

## Demo-Daten

`src/demo-data.ts` enthält **fiktive** Betriebe. Der Landesschlüssel 99 existiert nicht, und die Koordinaten gehören zu keinem bestimmten Betrieb.

## Befehle

```bash
npm install
npm run compile:fast   # Contract ohne ZK-Schlüssel (Compiler 0.31.0 nötig: compact update 0.31.0)
npm test               # kompletter Ablauf in der lokalen Simulation, inkl. Negativfälle
npm run compile        # voller Build mit Schlüsseln (lädt Parameter von srs.midnight.network)

# Beweiszeit mit dem offiziellen Proof-Server messen
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.3 midnight-proof-server --network preprod
npm run measure
```

## Gemessene Beweiszeiten

Gemessen am 15.10.2026 auf einer Cloud-VM mit 4 vCPUs und 15 GB RAM. Proof-Server 8.1.3, echte Beweise, Demo-Partie mit 2 Betrieben:

| Schritt | Zeit | Größe |
|---|---|---|
| Admin lässt Prüfstelle zu | 2,2 s | k = 13 |
| Prüfstelle veröffentlicht Bestätigung | 1,7 s | k = 13 |
| Betrieb registriert Partie | 7,0 s | k = 15 |
| **Entwaldungsnachweis** | **7,7 bis 8,2 s** (erster Lauf 15,5 s) | k = 16 |

Jeder Beweis ist 4.508 Byte groß. Die Zeit hängt nicht von der Zahl der Betriebe ab, weil der Circuit immer alle 4 Slots prüft.

## Bekannte Grenzen

* **Max. 4 Betriebe** pro Partie.
* **Kein Widerruf:** Bestätigungen laufen nur über ihr Ablaufdatum aus. Eine Prüfstelle kann eine einzelne Bestätigung noch nicht zurückziehen.
* **Ein Admin-Schlüssel:** Für den Produktivbetrieb braucht es eine Multisig.
* **Vollständigkeit:** Der Beweis zeigt, dass alle *angegebenen* Betriebe bestätigt sind. Dass die Liste vollständig ist, kommt erst mit der HI-Tier-Anbindung.
* **Geodaten für Behörden:** Behörden erhalten die Geodaten weiterhin über die Sorgfaltserklärung im EU-Informationssystem.
* **Kein Audit, keine Rechtsberatung.**
