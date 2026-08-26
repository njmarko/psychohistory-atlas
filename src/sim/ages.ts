/** Standard 5-year age groups used by UN WPP pyramids */
export const AGE_LABELS = [
  "0-4",
  "5-9",
  "10-14",
  "15-19",
  "20-24",
  "25-29",
  "30-34",
  "35-39",
  "40-44",
  "45-49",
  "50-54",
  "55-59",
  "60-64",
  "65-69",
  "70-74",
  "75-79",
  "80-84",
  "85-89",
  "90-94",
  "95-99",
  "100+",
] as const;

export const N_GROUPS = AGE_LABELS.length;

export const MID_AGES = AGE_LABELS.map((label, i) => {
  if (label === "100+") return 102;
  const [a, b] = label.split("-").map(Number);
  return (a + b) / 2;
});

export const START_AGES = AGE_LABELS.map((label) => {
  if (label === "100+") return 100;
  return Number(label.split("-")[0]);
});

export const MOTHER_GROUPS = [3, 4, 5, 6, 7, 8, 9] as const;
