# Tectonic – Kennisgraaf

> *SharePoint toont documenten als een lijst. Wij tonen ze als een netwerk: welke versies samenhangen, waar ze elkaar tegenspreken, welk document je kan vertrouwen, en wie je moet vragen.*

Medewerkers vinden vaak meerdere versies van hetzelfde document en weten niet welke ze kunnen vertrouwen. Tectonic voegt aan een SharePoint-achtige documentbibliotheek een weergave **Kennisgraaf** toe, naast Lijst en Tegels. Die toont welke documenten samenhangen, welke kopieën of tegenstrijdig zijn, welk document aanbevolen is en wie er inhoudelijk het meest aan werkte. Zo zie je bijvoorbeeld dat drie documenten die hetzelfde bedrag noemen eigenlijk één oude bron zijn, en dat een nieuwere goedgekeurde procedure iets anders zegt.

> **Alle data is fictief.** De documenten in `data/documents.json` zijn verzonnen demodata: bedragen, termijnen, regels, personen en klanten bestaan niet en zijn geen weergave van echte (Belgische, Nederlandse of Duitse) wetgeving.

## Draaien

Vereisten: Node.js 22+ en Python 3.12+.

```sh
# 1. Frontend
npm install

# 2. Analyse (Python)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 3. API-key voor Gemini (optioneel)
cp .env.example .env        # vul GEMINI_API_KEY in

# 4. Analyse draaien → data/analysis.json
.venv/bin/python scripts/analyze.py            # met Gemini
.venv/bin/python scripts/analyze.py --no-llm   # zonder API, alleen regels

# 5. App starten
npm run dev                  # http://localhost:5173
```

Open de bibliotheek, kies **Kennisgraaf** en zoek bijvoorbeeld op `maaltijdcheques`.

De LLM-resultaten worden bewaard in `data/llm_cache.json` (per documentpaar, ongeldig zodra een tekst wijzigt). Commit die cache: dan toont de demo altijd hetzelfde en is er geen API-key nodig om ze te herhalen. Het model is instelbaar met `GEMINI_MODEL` (standaard `gemini-3.8-flash`).

## Architectuur

De zware analyse gebeurt **vooraf**; de frontend leest alleen JSON. Dat houdt de demo snel en voorspelbaar, en de API-key blijft uit de browser.

```
data/documents.json     fictieve dataset (20 documenten)
scripts/analyze.py      gelijkenis, relaties, duplicaatgroepen, aanbevelingen, auteursstatistieken
data/analysis.json      output van analyze.py, gelezen door de frontend
data/llm_cache.json     gecachte Gemini-oordelen
src/views/              weergaven: Lijst, Tegels, Compact, Kennisgraaf
```

`analyze.py` in het kort:

1. TF-IDF (titel + tekst) en cosine similarity voor alle paren; een verband vanaf `SIM_EDGE = 0.35`.
2. Verschillend land → *ander toepassingsgebied* (regel, geen LLM).
3. De `MAX_LLM_PAIRS = 12` sterkste paren binnen hetzelfde land gaan naar Gemini: *duplicaat*, *tegenstrijdig* of *consistent*, met de letterlijke zinnen die verschillen. Citaten die niet letterlijk in het document staan, worden geweigerd. Zonder API of bij een fout: vanaf `SIM_DUP = 0.9` duplicaat, anders gelijkaardig.
4. Duplicaatgroepen tellen als één bron; de oudste is het origineel.
5. Aanbevolen document per cluster: niet verouderd, goedgekeurd boven concept, met eigenaar, meest recent, en niet tegengesproken door een nieuwer goedgekeurd document van hetzelfde land.

**In productie** zou de analyse draaien bij elke documentwijziging via de Microsoft Graph API, in plaats van vooraf op een vaste dataset.

## Een nieuwe weergave toevoegen

1. Maak een component in `src/views/` dat `ViewProps` ontvangt (zie `src/types.ts`) en `items` rendert.
2. Registreer het in `src/views/index.ts`. De knop verschijnt dan vanzelf in de weergaveschakelaar.

## Beperkingen en volgende stappen

- **Geen echte SharePoint-integratie**: een eigen clone met een vaste dataset, geen SPFx, geen authenticatie.
- **TF-IDF in plaats van embeddings**: werkt goed voor bijna letterlijke kopieën en gedeelde woordenschat, minder voor documenten die hetzelfde zeggen in andere woorden.
- **"Wie weet hier meer van?" is een startpunt, geen expertiseoordeel**: het telt inhoudelijke wijzigingen, niet of die wijzigingen juist waren.
- **Originele bron = oudste document** in een duplicaatgroep: een heuristiek.
- **Gemini-oordelen zijn niet volledig deterministisch** (het model ondersteunt geen `temperature` meer); de cache maakt de demo wel reproduceerbaar.
- Bewust niet gebouwd: uploads, bewerken, zoeken met embeddings, chatassistent, meertaligheid.
