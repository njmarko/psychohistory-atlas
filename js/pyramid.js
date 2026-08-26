import { AGE_LABELS, N_GROUPS } from "./ages.js";
import { totalPop } from "./simulation.js";

function formatNumber(n) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e4) return Math.round(n).toLocaleString("en-US");
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Draw a population pyramid on the given canvas.
 */
export function drawPyramid(canvas, frame, options) {
  const {
    countryName = "Country",
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
    tfr = null,
    /** Fixed absolute scale (people per bar). Keeps widths comparable over time. */
    scaleMax = null,
    /** Optional preloaded HTMLImageElement for the country flag */
    flagImage = null,
    /** Emoji fallback when no image (or for World) */
    flagEmoji = null,
  } = options;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  // Keep internal resolution sharp
  const W = Math.max(640, Math.round(cssW * dpr));
  const H = Math.max(480, Math.round(cssH * dpr));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Soft vignette
  const grad = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.5, W * 0.7);
  grad.addColorStop(0, "rgba(59,130,246,0.06)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const male = frame.male;
  const female = frame.female;
  const year = frame.year;
  const total = totalPop(male, female);
  const maleTotal = male.reduce((a, b) => a + b, 0);
  const femaleTotal = female.reduce((a, b) => a + b, 0);

  // Layout — generous side padding so count labels fit
  const padL = Math.round(W * 0.14);
  const padR = Math.round(W * 0.14);
  const padT = Math.round(H * 0.14);
  const padB = Math.round(H * 0.09);
  const centerGap = Math.round(W * 0.06);
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const halfW = (chartW - centerGap) / 2;
  const barH = chartH / N_GROUPS;
  const centerX = padL + halfW + centerGap / 2;

  // Fixed scale: use scaleMax from the base year so shrinking populations
  // actually look smaller (bars do not auto-zoom every frame).
  // Percent mode still scales relative to that frame's total.
  let maxVal = 1;
  if (showPercent) {
    for (let i = 0; i < N_GROUPS; i++) {
      maxVal = Math.max(maxVal, male[i] || 0, female[i] || 0);
    }
    maxVal *= 1.08;
  } else if (scaleMax != null && scaleMax > 0) {
    maxVal = scaleMax;
  } else {
    for (let i = 0; i < N_GROUPS; i++) {
      maxVal = Math.max(maxVal, male[i] || 0, female[i] || 0);
    }
    maxVal *= 1.08;
  }

  const muted = mixColor(textColor, bgColor, 0.45);
  const gridColor = mixColor(textColor, bgColor, 0.82);

  // Title block — "Population Pyramid — [flag] Country"
  const titleY = Math.round(H * 0.045);
  const titleFontSize = Math.round(H * 0.032);
  ctx.font = `600 ${titleFontSize}px "DM Sans", system-ui, sans-serif`;
  const titlePrefix = "Population Pyramid — ";
  const titleCountry = countryName;
  const prefixW = ctx.measureText(titlePrefix).width;
  const countryW = ctx.measureText(titleCountry).width;

  let flagDrawW = 0;
  let flagDrawH = 0;
  let flagGap = 0;
  const canDrawFlagImg =
    showFlag && flagImage && flagImage.complete && flagImage.naturalWidth > 0;
  const canDrawFlagEmoji = showFlag && !canDrawFlagImg && flagEmoji;

  if (canDrawFlagImg) {
    flagDrawH = Math.round(titleFontSize * 1.15);
    flagDrawW = Math.round(flagDrawH * (flagImage.naturalWidth / flagImage.naturalHeight));
    flagGap = Math.round(titleFontSize * 0.35);
  } else if (canDrawFlagEmoji) {
    flagDrawW = Math.round(titleFontSize * 1.35);
    flagDrawH = titleFontSize;
    flagGap = Math.round(titleFontSize * 0.25);
  }

  const totalTitleW = prefixW + flagDrawW + (flagDrawW ? flagGap : 0) + countryW;
  let x = (W - totalTitleW) / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = textColor;
  ctx.fillText(titlePrefix, x, titleY);
  x += prefixW;

  if (canDrawFlagImg) {
    const flagY = titleY - flagDrawH * 0.78;
    // subtle rounded clip + shadow
    ctx.save();
    roundClip(ctx, x, flagY, flagDrawW, flagDrawH, Math.max(2, flagDrawH * 0.12));
    ctx.drawImage(flagImage, x, flagY, flagDrawW, flagDrawH);
    ctx.restore();
    // thin border
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(1, dpr * 0.8);
    roundStroke(ctx, x, flagY, flagDrawW, flagDrawH, Math.max(2, flagDrawH * 0.12));
    x += flagDrawW + flagGap;
  } else if (canDrawFlagEmoji) {
    ctx.font = `${Math.round(titleFontSize * 1.15)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(flagEmoji, x, titleY);
    x += flagDrawW + flagGap;
    ctx.font = `600 ${titleFontSize}px "DM Sans", system-ui, sans-serif`;
  }

  ctx.fillStyle = textColor;
  ctx.fillText(titleCountry, x, titleY);

  ctx.textAlign = "center";
  ctx.font = `500 ${Math.round(H * 0.026)}px "DM Sans", system-ui, sans-serif`;
  ctx.fillStyle = muted;
  const totalStr = formatNumber(total);
  ctx.fillText(`Year ${year}  ·  Total population: ${totalStr}`, W / 2, Math.round(H * 0.082));

  if (tfr != null) {
    ctx.font = `400 ${Math.round(H * 0.018)}px "DM Sans", system-ui, sans-serif`;
    ctx.fillStyle = mixColor(textColor, bgColor, 0.55);
    ctx.fillText(`Assumed TFR: ${Number(tfr).toFixed(2)} children per woman`, W / 2, Math.round(H * 0.11));
  }

  // Grid + axis ticks
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

      // tick labels
      const val = maxVal * frac;
      const label = showPercent
        ? ((val / total) * 100).toFixed(1) + "%"
        : formatCompact(val);
      ctx.fillStyle = muted;
      ctx.font = `400 ${Math.round(H * 0.014)}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(label, xL, padT + chartH + Math.round(H * 0.025));
      ctx.fillText(label, xR, padT + chartH + Math.round(H * 0.025));
    }
    ctx.setLineDash([]);
  }

  // Center axis
  ctx.strokeStyle = mixColor(textColor, bgColor, 0.65);
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(centerX, padT);
  ctx.lineTo(centerX, padT + chartH);
  ctx.stroke();

  // Draw youngest (0-4) at bottom, oldest (100+) at top
  const gap = Math.max(1, barH * 0.08);

  for (let g = 0; g < N_GROUPS; g++) {
    const y = padT + (N_GROUPS - 1 - g) * barH + gap / 2;
    const h = Math.max(1, barH - gap);

    const mVal = male[g] || 0;
    const fVal = female[g] || 0;
    // Clamp so growth beyond fixed scale doesn't blow the layout
    const mW = Math.min(halfW, (mVal / maxVal) * halfW);
    const fW = Math.min(halfW, (fVal / maxVal) * halfW);

    // Male bar (left)
    const mGrad = ctx.createLinearGradient(centerX - centerGap / 2 - mW, y, centerX - centerGap / 2, y);
    mGrad.addColorStop(0, shade(maleColor, -12));
    mGrad.addColorStop(1, maleColor);
    ctx.fillStyle = mGrad;
    roundRect(ctx, centerX - centerGap / 2 - mW, y, mW, h, Math.min(4, h / 3), "right");
    ctx.fill();

    // Female bar (right)
    const fGrad = ctx.createLinearGradient(centerX + centerGap / 2, y, centerX + centerGap / 2 + fW, y);
    fGrad.addColorStop(0, femaleColor);
    fGrad.addColorStop(1, shade(femaleColor, -12));
    ctx.fillStyle = fGrad;
    roundRect(ctx, centerX + centerGap / 2, y, fW, h, Math.min(4, h / 3), "left");
    ctx.fill();

    // Age label in center
    if (showAgeLabels) {
      ctx.fillStyle = textColor;
      ctx.font = `500 ${Math.round(Math.min(barH * 0.55, H * 0.016))}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(AGE_LABELS[g], centerX, y + h / 2);
    }

    // Side counts
    if (showCounts) {
      const countFont = Math.round(Math.min(barH * 0.5, H * 0.0145));
      ctx.font = `400 ${countFont}px "JetBrains Mono", monospace`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = mixColor(maleColor, textColor, 0.35);

      const mLabel = showPercent
        ? ((mVal / total) * 100).toFixed(2) + "%"
        : formatNumber(mVal);
      const fLabel = showPercent
        ? ((fVal / total) * 100).toFixed(2) + "%"
        : formatNumber(fVal);

      ctx.textAlign = "right";
      ctx.fillText(mLabel, centerX - centerGap / 2 - mW - 8 * dpr, y + h / 2);

      ctx.fillStyle = mixColor(femaleColor, textColor, 0.35);
      ctx.textAlign = "left";
      ctx.fillText(fLabel, centerX + centerGap / 2 + fW + 8 * dpr, y + h / 2);
    }
  }

  // Legend
  if (showLegend) {
    const ly = H - Math.round(H * 0.035);
    const box = Math.round(H * 0.016);
    ctx.font = `500 ${Math.round(H * 0.016)}px "DM Sans", system-ui, sans-serif`;
    ctx.textBaseline = "middle";

    // Male
    ctx.fillStyle = maleColor;
    ctx.fillRect(W / 2 - Math.round(W * 0.12), ly - box / 2, box, box);
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.fillText(`Male (${formatNumber(maleTotal)})`, W / 2 - Math.round(W * 0.12) + box + 8, ly);

    // Female
    ctx.fillStyle = femaleColor;
    ctx.fillRect(W / 2 + Math.round(W * 0.02), ly - box / 2, box, box);
    ctx.fillStyle = textColor;
    ctx.fillText(`Female (${formatNumber(femaleTotal)})`, W / 2 + Math.round(W * 0.02) + box + 8, ly);
  }

  // Axis captions
  ctx.fillStyle = muted;
  ctx.font = `500 ${Math.round(H * 0.015)}px "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("← Male", padL + halfW * 0.5, padT - Math.round(H * 0.012));
  ctx.fillText("Female →", padL + halfW + centerGap + halfW * 0.5, padT - Math.round(H * 0.012));
}

function formatCompact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return String(Math.round(n));
}

function roundClip(ctx, x, y, w, h, r) {
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

function roundStroke(ctx, x, y, w, h, r) {
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

function roundRect(ctx, x, y, w, h, r, openSide) {
  // openSide: which side faces the center (no rounded corners there look better for bars)
  if (w <= 0 || h <= 0) {
    ctx.beginPath();
    return;
  }
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  if (openSide === "right") {
    // male: rounded on left
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  } else {
    // female: rounded on right
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }
}

function shade(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = Math.round((t - r) * p + r);
  const G = Math.round((t - g) * p + g);
  const B = Math.round((t - b) * p + b);
  return `rgb(${R},${G},${B})`;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixColor(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A.r * (1 - t) + B.r * t);
  const g = Math.round(A.g * (1 - t) + B.g * t);
  const bl = Math.round(A.b * (1 - t) + B.b * t);
  return `rgb(${r},${g},${bl})`;
}

export { formatNumber };
