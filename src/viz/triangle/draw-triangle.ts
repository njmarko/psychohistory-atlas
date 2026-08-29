import { N_GROUPS } from "../../sim/ages";
import { rebinAgeGroups } from "../../sim/age-bands";
import { totalPop } from "../../sim/cohort";
import { formatCompact, formatNumber } from "../format";
import { t } from "../../i18n";
import { add, layoutTriangle, scale as vscale, type SideFrame, type Vec } from "./layout";
import type { PyramidFrame } from "../../store/types";

export type TriangleDrawOptions = {
  countryName: string;
  maleColor: string;
  femaleColor: string;
  bgColor: string;
  textColor: string;
  flagImage?: HTMLImageElement | null;
  flagEmoji?: string | null;
  flagWindow?: boolean;
  showFlag?: boolean;
  tfr?: number | null;
  popScale?: number;
  deathScale?: number;
  birthScale?: number;
  /** When true, don't paint an opaque full-canvas background (map shows through). */
  overlay?: boolean;
  popBands?: number;
  mortBands?: number;
  fertBands?: number;
  outline?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  triangleTextColor?: string;
};

/** Keep canvas text upright for a person looking at the screen. */
function readableAngle(rad: number) {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
  return a;
}

function zeros(n: number) {
  return new Array(n).fill(0);
}

export function drawTriangle(
  canvas: HTMLCanvasElement,
  frame: PyramidFrame,
  options: TriangleDrawOptions
) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const W = cssW ? Math.max(2, Math.round(cssW * dpr)) : Math.max(2, canvas.width);
  const H = cssH ? Math.max(2, Math.round(cssH * dpr)) : Math.max(2, canvas.height);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!options.overlay) {
    ctx.fillStyle = options.bgColor;
    ctx.fillRect(0, 0, W, H);
  }

  const total = totalPop(frame.male, frame.female);
  const titleY = Math.round(H * 0.045);
  const flagImg = options.showFlag !== false && options.flagImage;
  const ink = options.triangleTextColor || options.textColor;
  const outline = options.outline !== false;
  const outlineColor = options.outlineColor || "#000000";
  const outlineWidth = options.outlineWidth ?? 3;
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(H * 0.03)}px "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  outlined(ctx, options.countryName, W / 2, titleY, outline, outlineColor, outlineWidth);
  ctx.font = `500 ${Math.round(H * 0.02)}px "DM Sans", system-ui, sans-serif`;
  outlined(
    ctx,
    t("canvas.yearPop", { year: frame.year, pop: formatNumber(total) }) +
      (options.tfr != null ? `  ·  ${t("canvas.tfr", { n: Number(options.tfr).toFixed(2) })}` : ""),
    W / 2,
    Math.round(H * 0.078),
    outline,
    outlineColor,
    outlineWidth
  );

  const size = Math.min(W, H) * 0.42;
  const tri = layoutTriangle(W / 2, H * 0.5, size);

  ctx.beginPath();
  ctx.moveTo(tri.A.x, tri.A.y);
  ctx.lineTo(tri.B.x, tri.B.y);
  ctx.lineTo(tri.C.x, tri.C.y);
  ctx.closePath();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = Math.max(2, dpr * 1.25);
  ctx.stroke();

  const deathsM = frame.deathsMale || zeros(N_GROUPS);
  const deathsF = frame.deathsFemale || zeros(N_GROUPS);
  const birthM = frame.birthsByMotherMale || zeros(N_GROUPS);
  const birthF = frame.birthsByMotherFemale || zeros(N_GROUPS);
  const deathTotal = (frame.deathsTotal ?? 0) || sum(deathsM) + sum(deathsF);
  const birthTotal = (frame.birthsTotal ?? 0) || sum(birthM) + sum(birthF);

  const popMax = sideScale(frame.male, frame.female, options.popBands ?? N_GROUPS, options.popScale);
  const deathMax = sideScale(deathsM, deathsF, options.mortBands ?? N_GROUPS, options.deathScale);
  const birthMax = sideScale(birthM, birthF, options.fertBands ?? N_GROUPS, options.birthScale);

  drawSidePyramid(ctx, tri.sides.left, {
    ...options,
    male: frame.male,
    female: frame.female,
    scaleMax: popMax,
    title: "",
    xCaption: "people",
    upright: true,
    sideId: "left" as const,
    bands: options.popBands ?? N_GROUPS,
    flagImage: flagImg || null,
    triangleTextColor: ink,
    outline,
    outlineColor,
    outlineWidth,
  });
  drawSidePyramid(ctx, tri.sides.right, {
    ...options,
    male: deathsM,
    female: deathsF,
    scaleMax: deathMax,
    title: "",
    xCaption: "deaths",
    upright: true,
    sideId: "right" as const,
    bands: options.mortBands ?? N_GROUPS,
    flagImage: flagImg || null,
    triangleTextColor: ink,
    outline,
    outlineColor,
    outlineWidth,
  });
  drawSidePyramid(ctx, tri.sides.bottom, {
    ...options,
    male: birthM,
    female: birthF,
    scaleMax: birthMax,
    title: "",
    xCaption: "births",
    upright: false,
    sideId: "bottom" as const,
    bands: options.fertBands ?? N_GROUPS,
    flagImage: flagImg || null,
    triangleTextColor: ink,
    outline,
    outlineColor,
    outlineWidth,
  });

  drawInnerCaption(ctx, tri.sides.left, t("canvas.population"), formatNumber(total), ink, outline, outlineColor, outlineWidth, H);
  drawInnerCaption(ctx, tri.sides.right, t("canvas.mortality"), formatNumber(deathTotal), ink, outline, outlineColor, outlineWidth, H);
  drawInnerCaption(ctx, tri.sides.bottom, t("canvas.fertility"), formatNumber(birthTotal), ink, outline, outlineColor, outlineWidth, H);
}

function sum(a: number[]) {
  return a.reduce((s, v) => s + (v || 0), 0);
}
function sideScale(male: number[], female: number[], bands: number, provided?: number) {
  if (provided != null && provided > 0) return provided;
  const r = rebinAgeGroups(male, female, bands);
  let m = 1;
  for (let i = 0; i < r.male.length; i++) m = Math.max(m, r.male[i] || 0, r.female[i] || 0);
  return m * 1.08;
}

function drawSidePyramid(
  ctx: CanvasRenderingContext2D,
  side: SideFrame,
  opts: TriangleDrawOptions & {
    male: number[];
    female: number[];
    scaleMax: number;
    title: string;
    xCaption: string;
    upright: boolean;
    bands: number;
    sideId?: "left" | "right" | "bottom";
  }
) {
  const rebinned = rebinAgeGroups(opts.male, opts.female, opts.bands);
  const male = rebinned.male;
  const female = rebinned.female;
  const labels = rebinned.labels;
  const depth = side.length * 0.72;
  const half = side.length * 0.48;
  const n = labels.length;
  const barDepth = depth / n;
  const gap = barDepth * 0.1;
  const ink = opts.triangleTextColor || opts.textColor;
  const ol = opts.outline !== false;
  const oc = opts.outlineColor || "#000";
  const ow = opts.outlineWidth ?? 3;
  let scaleMax = opts.scaleMax && opts.scaleMax > 0 ? opts.scaleMax : 0;
  if (!scaleMax) {
    for (let i = 0; i < n; i++) scaleMax = Math.max(scaleMax, male[i] || 0, female[i] || 0);
    scaleMax = Math.max(1, scaleMax) * 1.08;
  }

  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = Math.max(1.6, window.devicePixelRatio || 1);
  ctx.beginPath();
  ctx.moveTo(side.p0.x, side.p0.y);
  ctx.lineTo(side.p1.x, side.p1.y);
  ctx.stroke();

  const ticks = 3;
  const rangeFont = Math.max(12, Math.round(barDepth * 0.64));
  ctx.font = `500 ${Math.max(11, Math.round(barDepth * 0.58))}px "JetBrains Mono", monospace`;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tickAngle = opts.upright
    ? readableAngle(Math.atan2(side.tangent.y, side.tangent.x))
    : Math.atan2(side.tangent.y, side.tangent.x);
  for (let t = -ticks; t <= ticks; t++) {
    if (t === 0) continue;
    const frac = t / ticks;
    if (Math.abs(frac) > 0.72) continue;
    const along = vscale(side.tangent, frac * half * 0.82);
    const p = add(side.mid, along);
    const tick = vscale(side.outward, 6);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + tick.x, p.y + tick.y);
    ctx.stroke();
    const val = scaleMax * Math.abs(frac);
    const label = formatCompact(val);
    const lp = add(p, vscale(side.outward, -14));
    ctx.save();
    ctx.translate(lp.x, lp.y);
    ctx.rotate(tickAngle);
    outlined(ctx, label, 0, 0, ol, oc, ow);
    ctx.restore();
  }

  const bars: { origin: Vec; w: number; h: number; side: "m" | "f"; g: number }[] = [];

  for (let g = 0; g < n; g++) {
    const mVal = male[g] || 0;
    const fVal = female[g] || 0;
    const mW = Math.min(half, (mVal / scaleMax) * half);
    const fW = Math.min(half, (fVal / scaleMax) * half);
    const alongN = vscale(side.outward, g * barDepth + gap / 2);
    const h = barDepth - gap;
    const y0 = add(side.mid, alongN);
    bars.push({ origin: y0, w: mW, h, side: "m", g });
    bars.push({ origin: y0, w: fW, h, side: "f", g });
  }

  if (opts.flagWindow && opts.flagImage && opts.flagImage.complete && opts.flagImage.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    for (const b of bars) {
      if (b.w < 0.5) continue;
      pathBar(ctx, side, b.origin, b.w, b.h, b.side);
    }
    ctx.clip();
    const axes = flagAxes(side);
    ctx.translate(side.mid.x, side.mid.y);
    ctx.transform(axes.tx, axes.ty, axes.ox, axes.oy, 0, 0);
    if (opts.sideId === "left") {
      // Reflect over the pyramid x-axis (the triangle side / local x).
      ctx.translate(0, depth);
      ctx.scale(1, -1);
      ctx.drawImage(opts.flagImage, -half, 0, half * 2, depth);
    } else {
      const det = axes.tx * axes.oy - axes.ty * axes.ox;
      if (det < 0) ctx.drawImage(opts.flagImage, half, 0, -half * 2, depth);
      else ctx.drawImage(opts.flagImage, -half, 0, half * 2, depth);
    }
    ctx.restore();
  } else {
    for (const b of bars) {
      if (b.w < 0.5) continue;
      ctx.beginPath();
      pathBar(ctx, side, b.origin, b.w, b.h, b.side);
      ctx.fillStyle = b.side === "m" ? opts.maleColor : opts.femaleColor;
      ctx.fill();
    }
  }

  ctx.fillStyle = ink;
  ctx.font = `500 ${rangeFont}px "JetBrains Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let g = 0; g < n; g++) {
    if (g % 2 !== 0 && barDepth < 14 && n > 12) continue;
    const p = add(side.mid, vscale(side.outward, (g + 0.5) * barDepth));
    ctx.save();
    ctx.translate(p.x, p.y);
    const raw = Math.atan2(side.outward.y, side.outward.x) - Math.PI / 2;
    ctx.rotate(opts.upright ? readableAngle(raw) : raw);
    outlined(ctx, labels[g], 0, 0, ol, oc, ow);
    ctx.restore();
  }

}

function drawInnerCaption(
  ctx: CanvasRenderingContext2D,
  side: SideFrame,
  word: string,
  value: string,
  ink: string,
  outline: boolean,
  outlineColor: string,
  outlineWidth: number,
  canvasH: number
) {
  const angle = readableAngle(Math.atan2(side.tangent.y, side.tangent.x));
  const wordSize = Math.max(18, Math.round(canvasH * 0.032));
  const numSize = Math.max(16, Math.round(canvasH * 0.028));
  const line = wordSize + 6;
  const below = { x: -Math.sin(angle), y: Math.cos(angle) };
  const belowIsOutward = below.x * side.outward.x + below.y * side.outward.y > 0;
  const inwardPad = 30 + (belowIsOutward ? line + 8 : 16);
  const p = add(side.mid, vscale(side.outward, -inwardPad));
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${wordSize}px "DM Sans", system-ui, sans-serif`;
  outlined(ctx, word, 0, 0, outline, outlineColor, outlineWidth);
  ctx.font = `600 ${numSize}px "JetBrains Mono", monospace`;
  outlined(ctx, value, 0, line, outline, outlineColor, outlineWidth);
  ctx.restore();
}

/** Keep flag horizontal along the triangle side: left −60°, right +60°, bottom 0°. */
function flagAxes(side: SideFrame) {
  let tx = side.tangent.x;
  let ty = side.tangent.y;
  if (tx < 0) {
    tx = -tx;
    ty = -ty;
  }
  return { tx, ty, ox: side.outward.x, oy: side.outward.y };
}

function outlined(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  on: boolean,
  color: string,
  width: number
) {
  if (on && width > 0) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.restore();
  }
  ctx.fillStyle = ctx.fillStyle;
  ctx.fillText(text, x, y);
}

function pathBar(
  ctx: CanvasRenderingContext2D,
  side: SideFrame,
  origin: Vec,
  w: number,
  h: number,
  which: "m" | "f"
) {
  const dirT = which === "m" ? vscale(side.tangent, -1) : side.tangent;
  const p0 = origin;
  const p1 = add(origin, vscale(dirT, w));
  const p2 = add(p1, vscale(side.outward, h));
  const p3 = add(origin, vscale(side.outward, h));
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
}

function fillQuadImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p00: Vec,
  p10: Vec,
  p11: Vec,
  p01: Vec
) {
  // Approximate affine map with two triangles
  drawTexturedTriangle(ctx, img, p00, p10, p01, 0, 0, 1, 0, 0, 1);
  drawTexturedTriangle(ctx, img, p10, p11, p01, 1, 0, 1, 1, 0, 1);
}

function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x0: Vec, x1: Vec, x2: Vec,
  u0: number, v0: number, u1: number, v1: number, u2: number, v2: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0.x, x0.y);
  ctx.lineTo(x1.x, x1.y);
  ctx.lineTo(x2.x, x2.y);
  ctx.closePath();
  ctx.clip();
  void u0;
  void v0;
  void u1;
  void v1;
  void u2;
  void v2;
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0.x, x0.y);
  ctx.lineTo(x1.x, x1.y);
  ctx.lineTo(x2.x, x2.y);
  ctx.closePath();
  ctx.clip();
  const minx = Math.min(x0.x, x1.x, x2.x);
  const miny = Math.min(x0.y, x1.y, x2.y);
  const maxx = Math.max(x0.x, x1.x, x2.x);
  const maxy = Math.max(x0.y, x1.y, x2.y);
  ctx.drawImage(img, minx, miny, maxx - minx, maxy - miny);
  ctx.restore();
}
