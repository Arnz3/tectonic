# Bouwplan: Kennisgraaf-weergave (Tectonic Hackathon – SD Worx-casus)

> Dit bestand is de bron van waarheid voor wat we bouwen. Lees het volledig voordat je code schrijft.
> Tijdsbudget: ±75 minuten bouwen. Scope is heilig: bouw in de volgorde van de mijlpalen, niets extra.

## 1. Context in drie zinnen

SD Worx (HR- en payrolldienstverlener, 100+ landen) vraagt: *"Hoe maken we versnipperde organisatiekennis tot een betrouwbare gedeelde bron?"* Medewerkers vinden vaak meerdere versies van hetzelfde document en weten niet welke ze kunnen vertrouwen. Wij voegen aan een SharePoint-achtige documentbibliotheek een nieuwe weergave **"Kennisgraaf"** toe (naast Lijst en Tegels) die toont welke documenten samenhangen, welke duplicaten of tegenstrijdig zijn, welk document aanbevolen is, en wie er het meest inhoudelijk aan werkte.

Pitchzin: *"SharePoint toont documenten als een lijst. Wij tonen ze als een netwerk: welke versies samenhangen, waar ze elkaar tegenspreken, welk document je kan vertrouwen, en wie je moet vragen."*

## 2. Werkwijze voor Claude (lees dit eerst)

1. **Inspecteer eerst de bestaande repo.** Er bestaat al een eenvoudige SharePoint-clone. Hergebruik de stack, de stijl en de structuur ervan. Voeg de Kennisgraaf toe als extra weergave in de bestaande documentbibliotheek. Herschrijf de clone niet.
2. Werk mijlpaal per mijlpaal (sectie 8). Na elke mijlpaal moet de app draaien. Commit na elke mijlpaal.
3. Geen scope creep. Zie sectie 10 voor wat we bewust NIET bouwen.
4. Houd het simpel en deterministisch: de demo moet elke keer hetzelfde tonen.
5. UI-teksten in het Nederlands. Code, variabelen en commentaar in het Engels.

## 3. Architectuur

De zware analyse gebeurt **vooraf** in een script. De frontend leest alleen JSON. Dat houdt de demo snel en stabiel, en de API-key blijft uit de browser.

```
data/documents.json        # gegenereerde demo-dataset (fictief)
scripts/analyze.py         # berekent gelijkenis, relaties, aanbevelingen, auteursstatistieken
data/analysis.json         # output van analyze.py, gelezen door de frontend
<clone>/.../KnowledgeGraphView   # nieuwe weergave in de bestaande clone
```

- **analyze.py** (Python): scikit-learn TF-IDF + cosine similarity voor kandidaat-verbanden, Gemini alleen voor het classificeren van de sterkste paren. Draait lokaal met `python scripts/analyze.py`. Vlag `--no-llm` voor een fallback zonder API.
- **Frontend**: graaf met **vis-network** (npm of CDN, afhankelijk van de clone). Tijdlijn eenvoudig in HTML/CSS of met de bestaande tools van de clone.
- In productie (alleen in de pitch): analyse draait bij elke documentwijziging via de Microsoft Graph API. Niet bouwen.

## 4. Dataset: `data/documents.json`

Genereer ±20 **fictieve** documenten (Nederlandstalig, 150–350 woorden per document). Gebruik verzonnen bedragen en regels en zet in de README dat de data fictief is. Niet beweren dat dit echte Belgische wetgeving is.

### Schema per document

```json
{
  "id": "doc-01",
  "title": "Procedure maaltijdcheques 2025",
  "filename": "Procedure_maaltijdcheques_2025.docx",
  "folder": "Payroll BE / Procedures",
  "country": "BE",
  "topic": "maaltijdcheques",
  "layer": "procedure",
  "status": "goedgekeurd",
  "owner": "An Peeters",
  "created": "2025-01-10",
  "modified": "2025-03-12",
  "text": "…",
  "history": [
    { "author": "An Peeters", "date": "2025-03-12", "change": "inhoud", "summary": "Bedrag aangepast" },
    { "author": "Jens Maes",  "date": "2025-02-01", "change": "opmaak", "summary": "Lay-out" }
  ]
}
```

Toegestane waarden: `country` ∈ {BE, NL, DE}; `layer` ∈ {wet, sector, procedure, klant}; `status` ∈ {goedgekeurd, concept, verouderd}; `owner` mag `null` zijn; `change` ∈ {inhoud, opmaak}.

### Verplichte scenario's in de dataset

- **Cluster A – maaltijdcheques (hoofddemo):**
  - `doc-01` nieuwe goedgekeurde procedure 2025 met bedrag X.
  - `doc-02` oude procedure 2023 met bedrag Y (status `goedgekeurd`, niet als verouderd gemarkeerd: dat is het probleem).
  - `doc-03` en `doc-04`: bijna letterlijke kopieën van doc-02 in andere teammappen (andere titel/bestandsnaam, zelfde inhoud).
  - Doel: 3 documenten zeggen Y, 1 zegt X → "meerderheid voelt als waarheid". Onze tool toont "3 documenten, 1 oorspronkelijke bron" en beveelt doc-01 aan.
- **Cluster B – ander land:** `doc-05` Nederlandse variant van hetzelfde onderwerp, `country: NL`, ander bedrag. Dit is GEEN tegenstrijdigheid maar een ander toepassingsgebied.
- **Cluster C – Teams-bericht:** `doc-06` een geëxporteerd Teams-bericht (`layer: procedure`, `status: concept`, `folder: "Teams / Payroll BE"`) dat een andere termijn noemt dan de officiële procedure over hetzelfde onderwerp (bijv. eindejaarspremie, `doc-07`).
- **Zonder eigenaar:** minstens één relevant document met `owner: null`.
- **Opvulling:** ±10 documenten over andere onderwerpen (verlof, bedrijfswagens, onboarding, ecocheques) met enkele onderlinge verbanden, zodat de graaf niet leeg oogt.
- **Auteurs:** ±6 fictieve personen. Zorg dat één persoon veel `inhoud`-wijzigingen op cluster A heeft en één persoon vooral `opmaak`-wijzigingen.

## 5. Analyse: `scripts/analyze.py`

### Stappen

1. Laad `documents.json`. Bereken TF-IDF (titel + tekst) en de cosine similarity voor alle paren.
2. Kandidaat-verband als similarity ≥ `SIM_EDGE = 0.35`. Constanten bovenaan het script, zodat we ze kunnen tunen.
3. Relatie per verband bepalen:
   - Verschillend `country` → `ander_toepassingsgebied` (regel in code, geen LLM-aanroep).
   - Anders: Gemini-aanroep voor maximaal `MAX_LLM_PAIRS = 12` paren met de hoogste similarity. Overige verbanden → `gelijkaardig`.
   - `--no-llm` of API-fout → similarity ≥ `SIM_DUP = 0.9` wordt `duplicaat`, de rest `gelijkaardig`. Het script mag nooit crashen.
4. Duplicaatgroepen: verbonden componenten via `duplicaat`-verbanden. Per groep is de bron het document met de oudste `created`. Output: `"independent_sources"` per zoekcluster.
5. Aanbevolen document per verbonden component (regels in code, geen LLM):
   - status `verouderd` uitsluiten;
   - voorkeur `goedgekeurd` boven `concept`;
   - voorkeur met eigenaar boven zonder;
   - daarna meest recente `modified`;
   - uitsluiten als het `tegenstrijdig` is met een nieuwer goedgekeurd document van hetzelfde land.
   - Sla de redenen op als leesbare strings, bijv. `"Meest recent (12/03/2025)"`, `"Goedgekeurd"`, `"Eigenaar: An Peeters"`, `"Nieuwer dan tegenstrijdige versie doc-02"`.
6. Auteursstatistieken per document: aantal `inhoud`- en `opmaak`-wijzigingen per auteur.
7. Schrijf `data/analysis.json`. Cache LLM-resultaten in `data/llm_cache.json` (sleutel = gesorteerde doc-id's), zodat herhaalde runs geen API-aanroepen doen.

### Gemini-prompt (per paar, temperatuur 0, JSON-output)

Invoer: titel, land, laag en tekst van beide documenten. Opdracht (samengevat):

> Vergelijk document A en B. Antwoord uitsluitend met JSON:
> `{"relation": "duplicaat" | "tegenstrijdig" | "consistent", "statement_a": "…", "statement_b": "…", "explanation": "…"}`
> - `duplicaat`: in essentie dezelfde inhoud.
> - `tegenstrijdig`: ze doen een verschillende uitspraak over hetzelfde feit (bedrag, termijn, regel).
> - `consistent`: verwant, geen conflict.
> - `statement_a` / `statement_b`: de **letterlijke** zin uit elk document die verschilt (leeg als er geen conflict is). Nooit parafraseren of verzinnen.
> - `explanation`: één zin in het Nederlands.

Valideer de JSON-output. Bij ongeldige output: `gelijkaardig` als relatie.
`consistent` wordt in de UI getoond als `gelijkaardig`.

API-key uit omgevingsvariabele `GEMINI_API_KEY` (via `.env`, nooit committen). Maak `.env.example`.

### `analysis.json` (formaat)

```json
{
  "edges": [
    { "source": "doc-01", "target": "doc-02", "similarity": 0.82,
      "relation": "tegenstrijdig",
      "statement_a": "…", "statement_b": "…", "explanation": "…" }
  ],
  "recommended": { "doc-01": ["Meest recent (12/03/2025)", "Goedgekeurd", "Eigenaar: An Peeters"] },
  "duplicate_groups": [ { "original": "doc-02", "copies": ["doc-03", "doc-04"] } ],
  "author_stats": { "doc-01": { "An Peeters": { "inhoud": 3, "opmaak": 0 } } }
}
```

## 6. Frontend: weergave "Kennisgraaf"

### Plaats

In de bestaande documentbibliotheek van de clone een weergavekeuze: **Lijst | Tegels | Kennisgraaf**. De eerste twee bestaan al (of zijn eenvoudig); Kennisgraaf is nieuw.

### Gedrag

- **Zoekbalk** bovenaan. Zoeken = eenvoudige match (hoofdletterongevoelig) op titel, topic en tekst. Resultaten + hun directe buren (1 hop) vormen de graaf. Lege zoekopdracht = alle documenten.
- **Knopen** = documenten. Label = titel. Grootte = aantal inhoudelijke wijzigingen. Kleur = status (goedgekeurd / concept / verouderd). Aanbevolen document: dikke groene rand + badge "Aanbevolen".
- **Verbanden**:
  - `gelijkaardig`: grijs, dun
  - `duplicaat`: oranje
  - `tegenstrijdig`: rood, dikker
  - `ander_toepassingsgebied`: blauw, gestippeld
- **Legende** altijd zichtbaar.
- **Zijpaneel bij klik op knoop**: titel, map, land, laag, status, eigenaar (of "Geen eigenaar" in waarschuwingskleur), laatst gewijzigd, redenen van aanbeveling (indien aanbevolen), wijzigingsgeschiedenis.
- **Zijpaneel bij klik op verband**: relatie, de twee verschillende uitspraken naast elkaar met documenttitel erboven, en de uitleg.
- **Bronnenbadge** bovenaan de resultaten, bijv. *"4 documenten gevonden · 2 onafhankelijke bronnen"* (duplicaatgroepen tellen als één bron).
- **Paneel "Wie weet hier meer van?"**: top 3 auteurs over de zichtbare documenten, gesorteerd op `inhoud`-wijzigingen. Toon `opmaak` apart en kleiner. Subtekst: "Op basis van inhoudelijke wijzigingen".
- **Tijdlijn (alleen mijlpaal M5)**: horizontale strook met alle wijzigingen van de zichtbare documenten, gesorteerd op datum, kleur per document. Klik = knoop selecteren.
- **Lege toestand**: "Geen documenten gevonden voor deze zoekopdracht."

## 7. Security (Aikido-audit telt voor 10%)

- Geen secrets in de repo. `.env` in `.gitignore`, `.env.example` wel committen.
- **Alle documentdata als platte tekst renderen.** Gebruik `textContent` of gewone JSX-tekst. Geen `innerHTML`, geen `dangerouslySetInnerHTML`. Let op: de `title`-tooltip van vis-network interpreteert HTML → geef een tekstnode/element mee of escape de tekst.
- Zoekinvoer: trimmen, maximaal 100 tekens.
- Serveert de clone bestanden via een route? Dan alleen op basis van een id uit een whitelist, nooit op basis van een pad of bestandsnaam uit de request (geen path traversal).
- Geen `eval`, geen dynamische code.
- Dependencies vastpinnen.

## 8. Mijlpalen (strikte volgorde)

| # | Mijlpaal | Klaar wanneer |
|---|---|---|
| M1 | Dataset `documents.json` volgens sectie 4 | Alle scenario's aanwezig, JSON valideert |
| M2 | `analyze.py` met `--no-llm`, `analysis.json` gegenereerd | Verbanden, duplicaatgroepen, aanbevelingen, auteursstatistieken aanwezig |
| M3 | Kennisgraaf-weergave met zoeken, gekleurde verbanden, legende, zijpaneel knoop | Zoeken op "maaltijdcheques" toont cluster A met aanbevolen doc-01 |
| M4 | Gemini-classificatie + zijpaneel verband + bronnenbadge + "Wie weet hier meer van?" | Klik op rode lijn doc-01–doc-02 toont beide bedragen letterlijk |
| M5 | Tijdlijn (optioneel) | Alleen als M1–M4 af zijn en er tijd is |

Na M4: README schrijven (sectie 9). Security-checklist uit sectie 7 nalopen.

## 9. README-vereisten

- Wat het is (pitchzin + 3 zinnen).
- Hoe draaien: installatie, `.env` instellen, `python scripts/analyze.py` (of `--no-llm`), app starten.
- Dat de data fictief is.
- Architectuurkeuze: analyse vooraf, in productie bij elke documentwijziging via Microsoft Graph.
- Wat nog niet af is / beperkingen: geen echte SharePoint-integratie, TF-IDF in plaats van embeddings, "meeste wijzigingen" is een startpunt en geen expertiseoordeel, originele bron = oudste document (heuristiek).

## 10. Bewust NIET bouwen

Echte SharePoint/SPFx-integratie, authenticatie, database, vectordatabase, embeddings-API, chatbot/assistent, meertaligheid, bestandsuploads, bewerkfunctionaliteit, animaties. Noem wat relevant is in de README als volgende stap.

## 11. Demoscenario (moet werken)

1. Open de bibliotheek → schakel naar **Kennisgraaf**.
2. Zoek "maaltijdcheques" → badge "5 documenten · 3 onafhankelijke bronnen" (afhankelijk van dataset).
3. Graaf: doc-02/03/04 oranje verbonden (kopieën), rode lijn doc-01–doc-02, blauwe stippellijn naar het Nederlandse doc-05, doc-01 groen omrand als aanbevolen.
4. Klik rode lijn → twee bedragen letterlijk naast elkaar + uitleg.
5. Klik doc-01 → redenen van aanbeveling.
6. Paneel "Wie weet hier meer van?" → de persoon met de meeste inhoudelijke wijzigingen bovenaan.

## 12. Uitbreidingen (na M4, in deze volgorde)

### M4b – Expertscore (in analyze.py, output in analysis.json)
Per zoekcluster/verbonden component, per auteur:

score = Σ over inhoud-wijzigingen:
          doc_weight × recency_weight
        + 0.5 × aantal_verschillende_documenten
        + 1.0 als eigenaar van het aanbevolen document

doc_weight: aanbevolen = 1.0, goedgekeurd = 0.8, concept = 0.5,
            verouderd of kopie in duplicaatgroep = 0.2
recency_weight: 0.5 ^ (dagen_geleden / 365)
opmaak-wijzigingen: tellen niet mee in de score (wel tonen, apart).

Output per auteur: score, aantal inhoud-wijzigingen, aantal documenten,
laatste activiteit, reasons[] (leesbare NL-strings), warning (nullable).
warning = "Werkte vooral aan verouderde versies" als > 50% van zijn
inhoud-wijzigingen op documenten met doc_weight ≤ 0.2 valt.

Dataset: voeg een auteur "Tom" toe met veel inhoud-wijzigingen op
doc-02/03/04 (verouderd + kopieën) en bijna niets op doc-01.

UI: paneel "Aanspreekpunt" (niet "expert"): top 3 met score-balk,
redenen en eventuele waarschuwing in waarschuwingskleur.

### M4c – Tijd als x-as
Knopen x-positie vast op `modified` (lineaire schaal over zichtbare docs),
y in banen per land. vis-network: physics uit of alleen verticaal.
Datumlabels onder de as. Schakelaar "Tijdlijnweergave / Vrije graaf".

### M4d – Mensen als knopen (schakelaar "Toon mensen")
Ronde knopen per auteur, verbonden met documenten waar ze inhoud-wijzigingen
deden. Lijndikte = aantal wijzigingen. Andere vorm en kleur dan documenten.
Klik op persoon = zijpaneel met score, redenen en waarschuwing.

### Later / alleen in pitch
Tijdschuifregelaar, bel rond duplicaatgroepen, focusmodus bij conflict,
transparantie volgens veroudering.