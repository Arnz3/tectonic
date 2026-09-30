# Tectonic

Een eenvoudige SharePoint-achtige documentbibliotheek. Hier proberen we nieuwe weergaven uit.

> **Alle data is fictief.** De documenten in `data/documents.json` zijn verzonnen demodata: bedragen, termijnen, regels, personen en klanten bestaan niet en zijn geen weergave van echte (Belgische, Nederlandse of Duitse) wetgeving.

```sh
npm install
npm run dev
```

## Analyse draaien

De verbanden tussen documenten worden vooraf berekend en naar `data/analysis.json` geschreven. De frontend leest alleen die JSON.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/analyze.py --no-llm
```

Drempels (`SIM_EDGE`, `SIM_DUP`, `MAX_LLM_PAIRS`) staan bovenaan `scripts/analyze.py`.

## Een nieuwe weergave toevoegen

1. Maak een component in `src/views/` dat `ViewProps` ontvangt (zie `src/types.ts`) en `items` rendert.
2. Registreer het in `src/views/index.ts`. De knop verschijnt dan vanzelf in de weergaveschakelaar.

## Data

De bibliotheek toont de documenten uit `data/documents.json` (schema: zie `CLAUDE.md`, sectie 4). De mappen komen uit het veld `folder`. Klik op een bestand om de inhoud, metadata en wijzigingsgeschiedenis te zien.
