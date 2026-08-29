export type ViewMode = "pyramid" | "triangle" | "map" | "regions" | "database" | "help";

export type RegionName = "Europe" | "Asia" | "Africa" | "Americas" | "Oceania" | "Other";

export type SourceRef = {
  id: string;
  label: string;
  year: number;
  url?: string;
  note?: string;
};

export type SeriesPoint = {
  year: number;
  value: number;
  source: string;
};

export type CountryRecord = {
  name: string;
  iso2: string;
  iso3: string;
  isoNum: number;
  region: RegionName;
  includesKosovo?: boolean;
  note?: string;
  base: {
    year: number;
    male: number[];
    female: number[];
    population: number;
    source: SourceRef;
  };
  latest: {
    tfr: number;
    tfrYear: number;
    tfrSource: SourceRef;
    e0: number;
    e0Year: number;
    e0Source?: SourceRef;
    netMigration: number;
    netMigrationYear: number;
    netMigrationSource?: SourceRef;
    srb: number;
    idealTfr: number | null;
    idealTfrYear: number | null;
    idealTfrSource: SourceRef | null;
    idealTfrMeanAll: number | null;
    fertilityGap: number | null;
  };
  series: {
    tfr: SeriesPoint[];
    population: SeriesPoint[];
    e0: SeriesPoint[];
    netMigration: SeriesPoint[];
    idealTfr: SeriesPoint[];
    births?: SeriesPoint[];
    inflow?: SeriesPoint[];
    outflow?: SeriesPoint[];
  };
  wppMedium?: {
    tfr: SeriesPoint[];
    population: SeriesPoint[];
    e0: SeriesPoint[];
    netMigration: SeriesPoint[];
    births: SeriesPoint[];
    medianAge?: SeriesPoint[];
  };
};

export type DatasetMeta = {
  sources: SourceRef[];
  generatedAt?: string;
  notes?: string[];
};

export type SimParams = {
  tfr: number;
  lifeExpectancy: number;
  migration: number;
  sexRatioBirth: number;
};

export type PyramidFrame = {
  year: number;
  male: number[];
  female: number[];
  deathsMale?: number[];
  deathsFemale?: number[];
  birthsByMotherMale?: number[];
  birthsByMotherFemale?: number[];
  birthsTotal?: number;
  deathsTotal?: number;
  tfr?: number;
  lifeExpectancy?: number;
  netMigration?: number;
};

export type ColorMode = "diverging" | "sequential" | "tfrReplacement" | "dual";
export type PivotStat = "mean" | "median" | "popWeighted" | "custom";
export type IdealMode = "latest" | "meanAll";

export type TagField =
  | "flag"
  | "name"
  | "population"
  | "tfr"
  | "vsReplacement"
  | "fertilityGap"
  | "medianAge"
  | "elderly"
  | "year"
  | "netMigration";

export type CaptureScreen =
  | "pyramid"
  | "triangle"
  | "map"
  | "graphs"
  | "stats"
  | "yearStrip"
  | "pins";

export type ExportLayout = "single" | "splitH" | "splitV" | "mapGraphs" | "pyramidGraphs";
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "21:9";

export type MapPivot = {
  followMetric: boolean;
  stat: PivotStat;
  otherMetric: string | null;
  customValue: number | null;
};

export type AppState = {
  view: ViewMode;
  locale: "en" | "sr";
  country: string;
  scenario: SimParams & {
    useCountryTfr: boolean;
    useCountryLe: boolean;
    useCountryMig: boolean;
    useWppMediumRates: boolean;
    useUnE0ByYear: boolean;
    applyTfr: boolean;
    applyLe: boolean;
    applyMig: boolean;
    applySrb: boolean;
  };
  time: {
    startYear: number;
    endYear: number;
    currentYear: number;
    playing: boolean;
    yearsPerSecond: number;
    fitDurationSec: number | null;
  };
  hover: {
    matchSpeed: boolean;
    yearsPerSecond: number;
    size: number;
    titleSize: number;
    ageSize: number;
    showCounts: boolean;
    showAgeLabels: boolean;
    bands: number;
    opacity: number;
    flagWindow: boolean;
  };
  charts: {
    bg: string;
    text: string;
    showWpp: boolean;
    wppColor: string;
    series: Record<string, { on: boolean; color: string }>;
  };
  map: {
    metric: string;
    metricByView: Record<"map" | "regions" | "triangle", string>;
    countryFill: string;
    oceanColor: string;
    countrySet: "all" | "tfr2026";
    colorMode: ColorMode;
    paletteStops: 2 | 3;
    colors: { low: string; mid: string; high: string };
    pivot: MapPivot;
    pins: string[];
    pinOffsets: Record<string, { dx: number; dy: number }>;
    tagFields: TagField[];
    tagOpacity: number;
    hoverMini: boolean;
    hoverSpanYears: number;
    hubCard: boolean;
    triangleAnimate: boolean;
    showMissing: boolean;
    idealMode: IdealMode;
    surface: "map" | "globe";
    zoom: number;
    rotation: [number, number, number];
    pan: [number, number];
  };
  appearance: {
    maleColor: string;
    femaleColor: string;
    bgColor: string;
    textColor: string;
    showFlag: boolean;
    flagWindow: boolean;
    flagColors: boolean;
    showCounts: boolean;
    showAgeLabels: boolean;
    showGrid: boolean;
    showPercent: boolean;
    showLegend: boolean;
    showStats: boolean;
    labelOutline: boolean;
    labelOutlineColor: string;
    labelOutlineWidth: number;
    triangleTextColor: string;
    pyramidBands: number;
    trianglePopBands: number;
    triangleMortBands: number;
    triangleFertBands: number;
  };
  layout: {
    leftOpen: boolean;
    rightOpen: boolean;
    leftWidth: number;
    rightWidth: number;
    byView: Partial<Record<"pyramid" | "mapish" | "other", { leftOpen: boolean; rightOpen: boolean }>>;
    panelDefaults: number;
  };
  exportOpts: {
    screens: CaptureScreen[];
    layout: ExportLayout;
    resolution: "720p" | "1080p" | "1440p" | "4k" | "custom";
    customWidth: number;
    customHeight: number;
    aspect: AspectRatio;
    fps: number;
    format: "webm" | "mp4";
    fitToLength: boolean;
    durationSec: number;
  };
};

export const DEFAULT_STATE: AppState = {
  view: "pyramid",
  locale: "en",
  country: "Serbia",
  scenario: {
    tfr: 1.7,
    lifeExpectancy: 76,
    migration: 0,
    sexRatioBirth: 1.05,
    useCountryTfr: true,
    useCountryLe: true,
    useCountryMig: false,
    useWppMediumRates: false,
    useUnE0ByYear: true,
    applyTfr: true,
    applyLe: true,
    applyMig: false,
    applySrb: true,
  },
  time: {
    startYear: 2024,
    endYear: 2124,
    currentYear: 2024,
    playing: false,
    yearsPerSecond: 15,
    fitDurationSec: null,
  },
  hover: {
    matchSpeed: true,
    yearsPerSecond: 15,
    size: 480,
    titleSize: 18,
    ageSize: 12,
    showCounts: true,
    showAgeLabels: true,
    bands: 21,
    opacity: 92,
    flagWindow: true,
  },
  charts: {
    bg: "#0b1220",
    text: "#e2e8f0",
    showWpp: true,
    wppColor: "#94a3b8",
    series: {
      tfr: { on: true, color: "#f472b6" },
      pop: { on: true, color: "#38bdf8" },
      e0: { on: true, color: "#34d399" },
      mig: { on: true, color: "#fbbf24" },
      ideal: { on: true, color: "#a78bfa" },
      births: { on: true, color: "#fb7185" },
      inflow: { on: false, color: "#2dd4bf" },
    },
  },
  map: {
    metric: "tfr",
    metricByView: { map: "tfr", regions: "tfr", triangle: "" },
    countryFill: "#5A7A94",
    oceanColor: "#111A2F",
    countrySet: "all",
    colorMode: "diverging",
    paletteStops: 3,
    colors: { low: "#DC2626", mid: "#FFFFFF", high: "#2563EB" },
    pivot: {
      followMetric: true,
      stat: "mean",
      otherMetric: null,
      customValue: null,
    },
    pins: [],
    pinOffsets: {},
    tagFields: ["flag", "name", "population"],
    tagOpacity: 85,
    hoverMini: true,
    hoverSpanYears: 100,
    hubCard: true,
    triangleAnimate: true,
    showMissing: true,
    idealMode: "latest",
    surface: "map",
    zoom: 1,
    rotation: [0, 0, 0],
    pan: [0, 0],
  },
  appearance: {
    maleColor: "#3B82F6",
    femaleColor: "#F43F5E",
    bgColor: "#0F172A",
    textColor: "#E2E8F0",
    showFlag: true,
    flagWindow: true,
    flagColors: true,
    showCounts: true,
    showAgeLabels: true,
    showGrid: true,
    showPercent: false,
    showLegend: true,
    showStats: true,
    labelOutline: true,
    labelOutlineColor: "#000000",
    labelOutlineWidth: 3,
    triangleTextColor: "#F8FAFC",
    pyramidBands: 21,
    trianglePopBands: 21,
    triangleMortBands: 21,
    triangleFertBands: 21,
  },
  layout: {
    leftOpen: true,
    rightOpen: true,
    leftWidth: 340,
    rightWidth: 360,
    byView: {
      pyramid: { leftOpen: true, rightOpen: true },
    },
    panelDefaults: 2,
  },
  exportOpts: {
    screens: ["pyramid", "stats"],
    layout: "single",
    resolution: "1080p",
    customWidth: 1920,
    customHeight: 1080,
    aspect: "16:9",
    fps: 60,
    format: "mp4",
    fitToLength: false,
    durationSec: 12,
  },
};
