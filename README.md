# Tectonic – Kennisgraaf

> *SharePoint toont documenten als een lijst. Wij tonen ze als een netwerk: welke versies samenhangen, waar ze elkaar tegenspreken, welk document je kan vertrouwen, en wie je moet vragen.*

Medewerkers vinden vaak meerdere versies van hetzelfde document en weten niet welke ze kunnen vertrouwen. Tectonic voegt aan een SharePoint-achtige documentbibliotheek een weergave **Kennisgraaf** toe, naast Lijst en Tegels. Die toont welke documenten samenhangen, welke kopieën of tegenstrijdig zijn, welk document aanbevolen is en wie er inhoudelijk het meest aan werkte. Zo zie je bijvoorbeeld dat drie documenten die hetzelfde bedrag noemen eigenlijk één oude bron zijn, en dat een nieuwere goedgekeurde procedure iets anders zegt.

> **Alle data is fictief.** De documenten in `data/documents.json` zijn verzonnen demodata: bedragen, termijnen, regels, personen en klanten bestaan niet en zijn geen weergave van echte (Belgische, Nederlandse of Duitse) wetgeving.

## Draaien

Vereisten: Node.js 22.18+ en Python 3.12+.

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
npm test                     # toegangsfilter en demoscenario (node --test)
```

Open de bibliotheek, kies **Kennisgraaf** en zoek bijvoorbeeld op `maaltijdcheques`.

De LLM-resultaten worden bewaard in `data/llm_cache.json` (per documentpaar, ongeldig zodra een tekst wijzigt). Commit die cache: dan toont de demo altijd hetzelfde en is er geen API-key nodig om ze te herhalen. Het model is instelbaar met `GEMINI_MODEL` (standaard `gemini-3.8-flash`).

## Architectuur

De zware analyse gebeurt **vooraf**; de frontend leest alleen JSON. Dat houdt de demo snel en voorspelbaar, en de API-key blijft uit de browser.

```
data/documents.json     fictieve dataset (39 documenten)
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
6. Aanspreekpunt per cluster: een score per auteur op basis van inhoudelijke wijzigingen, gewogen naar het document (aanbevolen, goedgekeurd, concept, verouderd of kopie) en naar recentheid, met een waarschuwing voor wie vooral aan verouderde versies werkte.

In de Kennisgraaf kun je wisselen tussen een **vrije graaf** en een **tijdlijnweergave** (x-as = laatst gewijzigd, een baan per land), en met **Toon mensen** de auteurs als knopen tonen.

### Graffify

**Graffify** is een extra weergave naast de Kennisgraaf. Ze toont de onderwerpen van de bibliotheek als bollen rond "Documenten". Klik op een onderwerp, of typ in Graffify een vraag in de zoekbalk (bijvoorbeeld *"Hoeveel bedragen de maaltijdcheques?"*), en er opent een tijdlijn met een kaartje per document. Er is een baan per soort bron: Regelgeving, Procedures, Klant en Teams & mail.

- **Groen**: het aanbevolen document uit `analysis.json`, met een pijl tot vandaag.
- **Oranje, stippelrand, +N**: een duplicaatgroep, samengevoegd tot het nieuwste exemplaar. Klik erop om de kopieën horizontaal naast elkaar te zien.
- **Rood**: verouderd, of ouder dan het aanbevolen document waarmee het verbonden is. Een volle rode lijn loopt naar het document dat het vervangt.
- **Lichtgrijs**: ander land (ander toepassingsgebied). **Grijs**: ondersteunend.

Klik op een kaartje om het document te openen in het voorbeeldpaneel. In Graffify filtert de zoekbalk niet; de vraag bepaalt welk onderwerp opent (op onderwerpnaam, synoniemen of gedeelde woorden). De code staat in `src/views/AskMeView.tsx` en `src/views/askme/` (D3).

**In productie** zou de analyse draaien bij elke documentwijziging via de Microsoft Graph API, in plaats van vooraf op een vaste dataset.

## Wie weet het? (finale)

> *Je hoeft een document niet te mogen lezen om te weten wie je moet bellen.*

Kennis zit in meetings en in hoofden, en de meeste mensen mogen veel documenten niet openen. **Graffify** toont daarom bij elk onderwerp eerst *wie het weet* en pas daarna de documenten: wie je best contacteert, met één zin waarom, bijvoorbeeld *"Karim had 4 dagen geleden een meeting hierover en gaf er uitleg"*. Onder de onderwerpengraaf staat het raster *Wie weet wat?*; een onderwerp zonder documenten (thuiswerkvergoeding) toont alleen de mensen.

- **Signalen in plaats van invoer.** `scripts/signals.py` (draait mee met `analyze.py`) zet fictieve meetingtranscripten (`data/meetings.json`), Teams-antwoorden en opgeloste tickets (`data/workspace.json`) en documenteigenaars en -wijzigingen (`data/documents.json`) om in één lijst signalen: persoon, onderwerp, rol, leeftijd, letterlijk citaat en zichtbaarheid → `data/signals.json`. Met een `GEMINI_API_KEY` bepaalt Gemini per meeting wie uitleg gaf, besliste of een vraag stelde (gecachet; citaten moeten letterlijk in het transcript staan); zonder key of met `--no-llm` doen eenvoudige regels dat.
- **Score die vanzelf veroudert.** Gewicht per bron en rol (uitleg in meeting 3, beslissing 2,5, Teams-antwoord 2, ticket 2, eigenaar 1,5, meegewerkt 1, aanwezig 0,4, vraag 0,2) × 0,5^(dagen/30). Wie van rol wisselde, telt op zijn oude onderwerpen nog voor 40% mee en krijgt een waarschuwing.
- **Waarom en wie.** Elke persoon krijgt een *waarom*: hoe lang en hoeveel die met het onderwerp bezig is ("Al 2 weken mee bezig · 4 signalen: 2 meetings, 1 Teams-antwoord, 1 ticket · laatst 4 dagen geleden"), en een *wie*: *Waarschijnlijk juist antwoord*, *Weet veel, maar mogelijk verouderd* (vooral werk aan verouderde versies of kopieën volgens `analysis.json`, of een rolwissel) of *Weinig signalen*. In de graaf is grootte = waarom, afstand en kleur = wie. Alles uit metadata, nooit uit de inhoud.
- **Toegang.** Elk signaal is `open`, `beperkt` (met teams die toegang hebben) of `vertrouwelijk`. Vertrouwelijke bronnen worden al in het script én bij het inlezen geweigerd, ook uit score en onderwerpen. Met **Bekijk als** wissel je tussen *Payrollconsultant BE* en *Nieuwe medewerker*: dezelfde vraag geeft dezelfde persoon, maar afgeschermde bronnen tonen alleen *dat* iemand iets weet ("Karim gaf vorige week uitleg in een afgeschermde meeting"), met de knoppen *Vraag Karim* en *Vraag toegang*. De toegangscontrole zit in één functie (`canSee` in `src/people/model.ts`) en wordt getest met `npm test`.
- **Bus factor en kennisinterview.** Weet maar één actieve persoon er de laatste 90 dagen aantoonbaar iets van en is er geen recent document, dan verschijnt "Enkel Karim kent dit echt" met een knop voor een kennisinterview van 5 minuten. De antwoorden worden een nieuw signaal.
- **Verificatie met één klik.** *Verificatie na meeting* toont een mock van de Teams-kaart voor de organisator: kloppen de opgepikte onderwerpen? Bevestigde signalen krijgen een vinkje, afgewezen tellen niet meer mee.

Demo: kies **Graffify**, typ `wie kent de tankkaart?`, schakel *Bekijk als* naar *Nieuwe medewerker*, start het kennisinterview. *Demo resetten* onderaan wist interviews en verificaties.

Beperkingen: de transcripten, personen, berichten en tickets zijn fictief; er is geen koppeling met Teams, Microsoft Graph of ElevenLabs (de browser leest de interviewvragen voor); interviews en verificaties staan in `localStorage` van de browser en zijn zonder authenticatie manipuleerbaar. We tonen expertise, nooit prestaties. In productie filtert Microsoft Graph per gebruiker op toegang en bepalen sensitivity labels wat vertrouwelijk is.

## Een nieuwe weergave toevoegen

1. Maak een component in `src/views/` dat `ViewProps` ontvangt (zie `src/types.ts`) en `items` rendert.
2. Registreer het in `src/views/index.ts`. De knop verschijnt dan vanzelf in de weergaveschakelaar.

## Beperkingen en volgende stappen

- **Geen echte SharePoint-integratie**: een eigen clone met een vaste dataset, geen SPFx, geen authenticatie.
- **TF-IDF in plaats van embeddings**: werkt goed voor bijna letterlijke kopieën en gedeelde woordenschat, minder voor documenten die hetzelfde zeggen in andere woorden.
- **"Aanspreekpunt" is een startpunt, geen expertiseoordeel**: de score weegt inhoudelijke wijzigingen naar betrouwbaarheid en recentheid van het document, maar zegt niet of die wijzigingen juist waren. Recentheid wordt gemeten vanaf de laatste wijziging in de dataset, zodat de score bij elke run gelijk blijft.
- **Originele bron = oudste document** in een duplicaatgroep: een heuristiek.
- **Gemini-oordelen zijn niet volledig deterministisch** (het model ondersteunt geen `temperature` meer); de cache maakt de demo wel reproduceerbaar.
- Bewust niet gebouwd: uploads, bewerken, zoeken met embeddings, chatassistent, meertaligheid.
