<p align="center">
  <img src="public/njego.svg" width="72" height="72" alt="Psychohistory Atlas">
</p>

<h1 align="center">Psychohistory Atlas</h1>

<p align="center">
  <strong>Pyramids, a globe, and a hundred years of cohorts — for every country.</strong><br>
  Made by <strong>Marko Njegomir</strong> with Grok.
</p>

<p align="center">
  <img src="docs/screens/hero-globe-serbia.gif" alt="Globe heatmap of total fertility, Serbia in view" width="920">
</p>

<p align="center"><em>Serbia on the globe. Color is total fertility; white is the world average.</em></p>

---

Hari Seldon’s Prime Radiant was a display of a civilization’s future. This is that idea, pointed at **people**: age, births, deaths, and migration, country by country, played forward from UN data.

Default country is **Serbia**. Open a view, press **Space** to start or stop. Playback loops at the end year.

## Views

<p align="center">
  <img src="docs/screens/pyramid-serbia.gif" alt="Serbia population pyramid playing forward" width="920">
</p>

<p align="center"><em>Pyramid — Serbia, flag window, both side panels open.</em></p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screens/triangle-serbia.gif" alt="Triangle view with Serbia in the crosshair" width="100%">
      <p align="center"><em>Triangle — population, mortality, fertility over the map.</em></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screens/around-the-globe-triangle.gif" alt="Triangle overlay while the globe rotates" width="100%">
      <p align="center"><em>Triangle on the globe — spin the world, keep the three pyramids.</em></p>
    </td>
  </tr>
</table>

| View | What you get |
| --- | --- |
| **Pyramid** | Classic age–sex bars. Optional flag window, counts, grid, % of total. |
| **Triangle** | Three pyramids on one triangle over a map or globe. Click a year to freeze. |
| **World map** | Choropleth of TFR, population, migration, fertility gap, and more. Flat map or globe. |
| **Regions** | The same metrics, grouped by region (population-weighted). |
| **Database** | Edit values in this browser only. Export / import JSON. |
| **How it works** | The cohort formulas, map colors, and source licenses. |

## What it does

- **Cohort-component** engine: people age one year at a time; you see 5-year bars.
- **15 years per second** by default, **100-year** horizon, **loops** at the end. **Space** toggles play.
- Heatmaps **diverge around the mean** for TFR and most metrics (red below, white near average, blue above). **Absolute population** is a log scale.
- Hover a country on the world map: the mini-pyramid **follows the simulation year** and **pauses when you pause**.
- Country graphs can overlay the **UN WPP 2024 Medium** variant as a dashed line.
- Interface in **English** or **Serbian (Cyrillic)**.
- Not an official UN or national statistical office forecast.

## Data

| Source | Used for |
| --- | --- |
| **UN World Population Prospects 2024** (CC BY 3.0 IGO) | GEN/01 indicators (TFR, e0, population, net migration, births) and the age–sex base |
| **BirthGauge / national statistical offices** | Recent TFR (2015–2026) where the file has it |
| **DHS STATcompiler** `PR_IDLC_W_MNA` | Mean ideal number of children, women 15–49 |
| **Eurobarometer / OECD Family Database / GGS** | Ideals where DHS does not cover |
| **OECD International Migration Database** | Optional gross inflows on the graphs only |

Age–sex pyramids are this app’s model on a 2024 five-year extract. GEN/01 does not ship full pyramids, so the animation is not WPP’s official age structure.

The World Fertility Ideals / FSD4032 compilation cannot be redistributed (research license). Paste those values in **Database** if you have access.

United Nations, Department of Economic and Social Affairs, Population Division (2024). *World Population Prospects 2024*.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

```bash
npm run build       # production bundle in dist/
npm run preview     # serve dist/
npm run data:check
npm run data:ingest # optional: refresh DHS ideals
npm run data:wpp    # extract UN WPP 2024 GEN/01 xlsx → public/data/wpp2024/*.json
```

The original `data/WPP2024_GEN_F01_DEMOGRAPHIC_INDICATORS_FULL.xlsx` is ~144 MB and is **gitignored** (GitHub’s file limit is 100 MB). Commit only the JSON shards in `public/data/wpp2024/`.

Static Vite app. On **Vercel**, import the repo (build `npm run build`, output `dist`). `vercel.json` is included.

## License

Application code: MIT. UN WPP data: CC BY 3.0 IGO. Attribute sources if you republish figures.
