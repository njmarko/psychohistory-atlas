import { N_GROUPS } from "../../sim/ages";
import { rebinAgeGroups } from "../../sim/age-bands";
import { totalPop } from "../../sim/cohort";
import { formatCompact, formatNumber, mixColor, shade } from "../format";
import type { PyramidFrame } from "../../store/types";
import { t } from "../../i18n";

export type PyramidDrawOptions = {
  countryName?: string;
  populationLabel?: string;
  maleColor?: string;
  femaleColor?: string;
  bgColor?: string;
  textColor?: string;
  showCounts?: boolean;
  showAgeLabels?: boolean;
  showGrid?: boolean;
  showPercent?: boolean;
  showLegend?: boolean;
  showFlag?: boolean;
  flagWindow?: boolean;
  tfr?: number | null;
  scaleMax?: number | null;
  flagImage?: HTMLImageElement | null;
  flagEmoji?: string | null;
  subtitle?: string;
  bands?: number;
  titleSize?: number;
  ageSize?: number;
  outline?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
};

export function drawPyramid(
  canvas: HTMLCanvasElement,
  frame: PyramidFrame,
  options: PyramidDrawOptions
) {
  const {
    countryName = "Country",
    populationLabel,
    maleColor = "#3B82F6",
    femaleColor = "#F43F5E",
    bgColor = "#0F172A",
    textColor = "#E2E8F0",
    showCounts = true,
    showAgeLabels = true,
    showGrid = true,
    showPercent = false,
    showLegend = true,
    showFlag = true,
    flagWindow = false,
    tfr = null,
    scaleMax = null,
    flagImage = null,
    flagEmoji = null,
    subtitle,
    bands = N_GROUPS,
    titleSize,
    ageSize,
    outline = false,
    outlineColor = "#000000",
    outlineWidth = 3,
  } = options;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  const W = Math.max(2, Math.round(cssW * dpr));
  const H = Math.max(2, Math.round(cssH * dpr));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.5, W * 0.7);
  grad.addColorStop(0, "rgba(59,130,246,0.06)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const rebinned = rebinAgeGroups(frame.male, frame.female, bands);
  const male = rebinned.male;
  const female = rebinned.female;
  const ageLabels = rebinned.labels;
  const n = ageLabels.length;
  const year = frame.year;
  const total = totalPop(male, female);
  const maleTotal = male.reduce((a, b) => a + b, 0);
  const femaleTotal = female.reduce((a, b) => a + b, 0);

  let titleFontSize = titleSize ? Math.round(titleSize * dpr) : Math.round(H * 0.032);
  let subSize = titleSize ? Math.round(titleSize * 0.82 * dpr) : Math.round(H * 0.026);
  let tfrSize = titleSize ? Math.round(titleSize * 0.7 * dpr) : Math.round(H * 0.02);
  const headerBudget = Math.round(H * 0.3);
  const rawHeader =
    titleFontSize * 1.22 +
    subSize +
    (tfr != null ? tfrSize : 0) +
    titleFontSize * 0.82;
  if (rawHeader > headerBudget) {
    const s = headerBudget / rawHeader;
    titleFontSize = Math.max(8, Math.round(titleFontSize * s));
    subSize = Math.max(7, Math.round(subSize * s));
    tfrSize = Math.max(6, Math.round(tfrSize * s));
  }
  const headerGap = Math.max(2, Math.round(titleFontSize * 0.16));
  const titleY = titleFontSize + Math.round(titleFontSize * 0.22);
  const subY = titleY + headerGap + subSize;
  const tfrY = tfr != null ? subY + headerGap + tfrSize : subY;
  const padL = Math.round(W * 0.1);
  const padR = Math.round(W * 0.1);
  const padT = tfrY + Math.round(titleFontSize * 0.45) + (titleSize ? subSize : 0);
  const padB = Math.round(H * (showLegend ? 0.09 : 0.05));
  const centerGap = Math.round(W * 0.055);
  const chartW = Math.max(8, W - padL - padR);
  const chartH = Math.max(8, H - padT - padB);
  const halfW = (chartW - centerGap) / 2;
  const barH = chartH / n;
  const centerX = padL + halfW + centerGap / 2;

  let maxVal = 1;
  if (showPercent || n !== N_GROUPS || scaleMax == null || scaleMax <= 0) {
    for (let i = 0; i < n; i++) maxVal = Math.max(maxVal, male[i] || 0, female[i] || 0);
    maxVal *= 1.08;
  } else {
    maxVal = scaleMax;
  }

  const muted = mixColor(textColor, bgColor, 0.45);
  const gridColor = mixColor(textColor, bgColor, 0.82);
  ctx.font = `600 ${titleFontSize}px "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = textColor;

  const canDrawFlagImg = !!(showFlag && flagImage && flagImage.complete && flagImage.naturalWidth > 0);
  const canDrawFlagEmoji = !!(showFlag && !canDrawFlagImg && flagEmoji);
  const title = countryName;
  const titleW = ctx.measureText(title).width;
  let flagDrawH = 0, flagDrawW = 0, flagGap = 0;
  if (canDrawFlagImg && flagImage) {
    flagDrawH = Math.round(titleFontSize * 1.15);
    flagDrawW = Math.round(flagDrawH * (flagImage.naturalWidth / flagImage.naturalHeight));
    flagGap = Math.round(titleFontSize * 0.35);
  } else if (canDrawFlagEmoji) {
    flagDrawW = Math.round(titleFontSize * 1.35);
    flagGap = Math.round(titleFontSize * 0.25);
  }
  let x = (W - (titleW + flagDrawW + (flagDrawW ? flagGap : 0))) / 2;
  ctx.textAlign = "left";
  if (canDrawFlagImg && flagImage) {
    const flagY = titleY - flagDrawH * 0.78;
    ctx.save();
    roundClip(ctx, x, flagY, flagDrawW, flagDrawH, Math.max(2, flagDrawH * 0.12));
    ctx.drawImage(flagImage, x, flagY, flagDrawW, flagDrawH);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(1, dpr * 0.8);
    roundStroke(ctx, x, flagY, flagDrawW, flagDrawH, Math.max(2, flagDrawH * 0.12));
    x += flagDrawW + flagGap;
  } else if (canDrawFlagEmoji && flagEmoji) {
    ctx.font = `${Math.round(titleFontSize * 1.15)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
    ctx.fillText(flagEmoji, x, titleY);
    x += flagDrawW + flagGap;
    ctx.font = `600 ${titleFontSize}px "DM Sans", system-ui, sans-serif`;
  }
  ctx.fillStyle = textColor;
  fillOutlined(ctx, title, x, titleY, outline, outlineColor, outlineWidth);

  ctx.textAlign = "center";
  ctx.font = `500 ${subSize}px "DM Sans", system-ui, sans-serif`;
  ctx.fillStyle = muted;
  const popStr = populationLabel || formatNumber(total);
  fillOutlined(ctx, t("canvas.yearPop", { year, pop: popStr }), W / 2, subY, outline, outlineColor, outlineWidth);
  if (tfr != null) {
    ctx.font = `500 ${tfrSize}px "DM Sans", system-ui, sans-serif`;
    ctx.fillStyle = mixColor(textColor, bgColor, 0.35);
    fillOutlined(
      ctx,
      subtitle || t("canvas.tfr", { n: Number(tfr).toFixed(2) }),
      W / 2,
      tfrY,
      outline,
      outlineColor,
      Math.max(1, outlineWidth * 0.7)
    );
  }

  if (showGrid) {
    const ticks = 4;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = Math.max(1, dpr * 0.6);
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    for (let t = 1; t <= ticks; t++) {
      const frac = t / ticks;
      const xL = centerX - centerGap / 2 - halfW * frac;
      const xR = centerX + centerGap / 2 + halfW * frac;
      ctx.beginPath();
      ctx.moveTo(xL, padT);
      ctx.lineTo(xL, padT + chartH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xR, padT);
      ctx.lineTo(xR, padT + chartH);
      ctx.stroke();
      const val = maxVal * frac;
      const label = showPercent ? ((val / total) * 100).toFixed(1) + "%" : formatCompact(val);
      ctx.fillStyle = muted;
      ctx.font = `400 ${Math.round(H * 0.018)}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(label, xL, padT + chartH + Math.round(H * 0.025));
      ctx.fillText(label, xR, padT + chartH + Math.round(H * 0.025));
    }
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = mixColor(textColor, bgColor, 0.65);
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(centerX, padT);
  ctx.lineTo(centerX, padT + chartH);
  ctx.stroke();

  const gap = Math.max(1, barH * 0.08);
  const bars: { x: number; y: number; w: number; h: number; side: "m" | "f" }[] = [];

  for (let g = 0; g < n; g++) {
    const y = padT + (n - 1 - g) * barH + gap / 2;
    const h = Math.max(1, barH - gap);
    const mVal = male[g] || 0;
    const fVal = female[g] || 0;
    const mW = Math.min(halfW, (mVal / maxVal) * halfW);
    const fW = Math.min(halfW, (fVal / maxVal) * halfW);
    bars.push({ x: centerX - centerGap / 2 - mW, y, w: mW, h, side: "m" });
    bars.push({ x: centerX + centerGap / 2, y, w: fW, h, side: "f" });
  }

  if (flagWindow && canDrawFlagImg && flagImage) {
    const fullX = centerX - centerGap / 2 - halfW;
    const fullW = halfW * 2 + centerGap;
    ctx.save();
    ctx.beginPath();
    for (const b of bars) {
      if (b.w > 0.5) ctx.rect(b.x, b.y, b.w, b.h);
    }
    ctx.clip();
    if (W > H) {
      const imgW = flagImage.naturalWidth;
      const imgH = flagImage.naturalHeight;
      const imgAspect = imgW / Math.max(1, imgH);
      const boxAspect = fullW / Math.max(1, chartH);
      let sx = 0, sy = 0, sw = imgW, sh = imgH;
      if (imgAspect > boxAspect) {
        sw = imgH * boxAspect;
        sx = (imgW - sw) / 2;
      } else {
        sh = imgW / boxAspect;
        sy = (imgH - sh) / 2;
      }
      ctx.drawImage(flagImage, sx, sy, sw, sh, fullX, padT, fullW, chartH);
    } else {
      ctx.drawImage(flagImage, fullX, padT, fullW, chartH);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = Math.max(1, dpr * 0.6);
    for (const b of bars) {
      if (b.w <= 0.5) continue;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  } else {
    for (const b of bars) {
      if (b.w <= 0) continue;
      if (b.side === "m") {
        const mGrad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
        mGrad.addColorStop(0, shade(maleColor, -12));
        mGrad.addColorStop(1, maleColor);
        ctx.fillStyle = mGrad;
        roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(4, b.h / 3), "right");
        ctx.fill();
      } else {
        const fGrad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
        fGrad.addColorStop(0, femaleColor);
        fGrad.addColorStop(1, shade(femaleColor, -12));
        ctx.fillStyle = fGrad;
        roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(4, b.h / 3), "left");
        ctx.fill();
      }
    }
  }

  for (let g = 0; g < n; g++) {
    const y = padT + (n - 1 - g) * barH + gap / 2;
    const h = Math.max(1, barH - gap);
    const mVal = male[g] || 0;
    const fVal = female[g] || 0;
    const mW = Math.min(halfW, (mVal / maxVal) * halfW);
    const fW = Math.min(halfW, (fVal / maxVal) * halfW);
    if (showAgeLabels) {
      ctx.fillStyle = textColor;
      ctx.font = `500 ${Math.round(Math.min(barH * 0.88, ageSize ? ageSize * dpr : H * 0.022))}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fillOutlined(ctx, ageLabels[g], centerX, y + h / 2, outline, outlineColor, outlineWidth);
    }
    if (showCounts) {
      const countFont = Math.round(Math.min(barH * 0.7, H * 0.02));
      ctx.font = `400 ${countFont}px "JetBrains Mono", monospace`;
      ctx.textBaseline = "middle";
      const mLabel = showPercent ? ((mVal / total) * 100).toFixed(2) + "%" : formatNumber(mVal);
      const fLabel = showPercent ? ((fVal / total) * 100).toFixed(2) + "%" : formatNumber(fVal);
      ctx.fillStyle = mixColor(maleColor, textColor, 0.35);
      ctx.textAlign = "right";
      ctx.fillText(mLabel, centerX - centerGap / 2 - mW - 8 * dpr, y + h / 2);
      ctx.fillStyle = mixColor(femaleColor, textColor, 0.35);
      ctx.textAlign = "left";
      ctx.fillText(fLabel, centerX + centerGap / 2 + fW + 8 * dpr, y + h / 2);
    }
  }

  if (showLegend) {
    const ly = H - Math.round(H * 0.035);
    const box = Math.round(titleSize ? subSize * 0.7 : H * 0.016);
    ctx.font = `500 ${titleSize ? subSize : Math.round(H * 0.016)}px "DM Sans", system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = maleColor;
    ctx.fillRect(W / 2 - Math.round(W * 0.12), ly - box / 2, box, box);
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.fillText(`${t("canvas.male")} (${formatNumber(maleTotal)})`, W / 2 - Math.round(W * 0.12) + box + 8, ly);
    ctx.fillStyle = femaleColor;
    ctx.fillRect(W / 2 + Math.round(W * 0.02), ly - box / 2, box, box);
    ctx.fillStyle = textColor;
    ctx.fillText(`${t("canvas.female")} (${formatNumber(femaleTotal)})`, W / 2 + Math.round(W * 0.02) + box + 8, ly);
  }

  ctx.fillStyle = muted;
  const axisFont = titleSize ? subSize : Math.round(H * 0.015);
  ctx.font = `500 ${axisFont}px "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  const maleAxis = showLegend ? `← ${t("canvas.male")}` : `← ${t("canvas.male")}  ${formatNumber(maleTotal)}`;
  const femaleAxis = showLegend ? `${t("canvas.female")} →` : `${t("canvas.female")}  ${formatNumber(femaleTotal)} →`;
  ctx.fillText(maleAxis, padL + halfW * 0.5, padT - Math.round(Math.max(axisFont * 0.35, H * 0.012)));
  ctx.fillText(femaleAxis, padL + halfW + centerGap + halfW * 0.5, padT - Math.round(Math.max(axisFont * 0.35, H * 0.012)));
}

function fillOutlined(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  outline: boolean,
  outlineColor: string,
  outlineWidth: number
) {
  if (outline && outlineWidth > 0) {
    ctx.save();
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.restore();
  }
  ctx.fillText(text, x, y);
}

function roundClip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.clip();
}

function roundStroke(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  openSide: "left" | "right"
) {
  if (w <= 0 || h <= 0) {
    ctx.beginPath();
    return;
  }
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  if (openSide === "right") {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }
}

export { formatNumber };
