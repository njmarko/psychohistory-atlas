# Adding a language

1. Append a row to `LOCALES` in `index.ts` (`id`, `bcp47`, `flag`, `nativeName`, `short`).
2. Copy `en.ts` → `xx.ts`, translate every string, export as `Messages`.
3. Register the catalog in `CATALOGS` and extend `LocaleId` / `isLocaleId`.
4. Copy `HELP_HTML_EN` in `src/ui/help.ts` → a `HELP_HTML_XX` and switch in `getHelpHtml`.
5. Optional: add names in `countries.ts` under `xx: { Serbia: "…", … }`. Missing names stay English.
6. The navbar picker, `t()`, combos, canvas, map, and help pick it up automatically.
