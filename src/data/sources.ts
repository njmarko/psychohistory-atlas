import type { SourceRef } from "../store/types";

export const SOURCES: Record<string, SourceRef> = {
  wpp2024: {
    id: "wpp2024",
    label: "UN World Population Prospects 2024",
    year: 2024,
    url: "https://population.un.org/wpp/",
    note: "CC BY 3.0 IGO. Age–sex structure, TFR, life expectancy, net migration.",
  },
  birthgauge2026: {
    id: "birthgauge2026",
    label: "BirthGauge / national statistical offices (2026 TFR file)",
    year: 2026,
    url: "https://x.com/BirthGauge",
    note: "Recent TFR and births compiled from NSOs; 2025–2026 figures.",
  },
  dhs: {
    id: "dhs",
    label: "DHS STATcompiler — mean ideal number of children (women 15–49)",
    year: 2024,
    url: "https://api.dhsprogram.com/",
    note: "Indicator PR_IDLC_W_MNA. All available survey years per country.",
  },
  eurobarometer: {
    id: "eurobarometer",
    label: "Eurobarometer / OECD Family Database / GGS (published means)",
    year: 2023,
    url: "https://www.oecd.org/els/family/database.htm",
    note: "Ideal family size for countries not covered by DHS.",
  },
  oecdMig: {
    id: "oecdMig",
    label: "OECD International Migration Database",
    year: 2023,
    url: "https://www.oecd.org/migration/",
    note: "Gross inflows/outflows for OECD members where available.",
  },
  poppyramid: {
    id: "poppyramid",
    label: "PopulationPyramid.net (UN WPP 2024-derived age–sex)",
    year: 2024,
    url: "https://www.populationpyramid.net/",
    note: "Used when a direct WPP 5-year age–sex extract is not bundled.",
  },
};

export const REPLACEMENT_TFR = 2.1;
