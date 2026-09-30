# Tectonic

Een eenvoudige SharePoint-achtige documentbibliotheek met mock-bestanden. Hier proberen we nieuwe weergaven uit.

```sh
npm install
npm run dev
```

## Een nieuwe weergave toevoegen

1. Maak een component in `src/views/` dat `ViewProps` ontvangt (zie `src/types.ts`) en `items` rendert.
2. Registreer het in `src/views/index.ts`. De knop verschijnt dan vanzelf in de weergaveschakelaar.

De mockdata staat in `src/mockData.ts`.
