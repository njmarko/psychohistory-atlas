import { getLocale, t } from "../i18n";

export function renderYearStrip(
  el: HTMLElement,
  years: number[],
  current: number,
  onPick: (year: number) => void
) {
  const rangeKey = `${getLocale()}:${years[0]}:${years[years.length - 1]}:${years.length}`;
  if (el.dataset.range === rangeKey && el.querySelector(".year-strip-inner")) {
    (el as any)._onPick = onPick;
    updateYearStripFocus(el, current);
    return;
  }
  el.dataset.range = rangeKey;
  el.classList.add("year-strip");
  const min = years[0];
  const max = years[years.length - 1];
  el.innerHTML = "";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "year-arrow year-arrow-prev";
  prev.textContent = "‹";
  prev.setAttribute("data-tip", t("yearStrip.prev"));
  const pickRelative = (delta: number) => {
    const focused = Number(el.querySelector(".year-chip.focus")?.getAttribute("data-year"));
    const cur = Number.isFinite(focused) ? focused : current;
    const pick = ((el as any)._onPick as typeof onPick) || onPick;
    pick(Math.max((el as any)._min ?? min, Math.min((el as any)._max ?? max, cur + delta)));
  };
  prev.addEventListener("click", (e) => {
    e.stopPropagation();
    pickRelative(-1);
  });

  const next = document.createElement("button");
  next.type = "button";
  next.className = "year-arrow year-arrow-next";
  next.textContent = "›";
  next.setAttribute("data-tip", t("yearStrip.next"));
  next.addEventListener("click", (e) => {
    e.stopPropagation();
    pickRelative(1);
  });

  const inner = document.createElement("div");
  inner.className = "year-strip-inner";
  inner.style.cursor = "grab";
  inner.setAttribute("data-tip", t("yearStrip.drag"));

  for (const y of years) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "year-chip";
    b.textContent = String(y);
    b.dataset.year = String(y);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const pick = ((el as any)._onPick as typeof onPick) || onPick;
      pick(y);
    });
    inner.appendChild(b);
  }

  el.appendChild(prev);
  el.appendChild(inner);
  el.appendChild(next);
  (el as any)._onPick = onPick;
  (el as any)._min = min;
  (el as any)._max = max;

  let dragging = false;
  let startX = 0;
  let startYear = current;
  const pxPerYear = 28;
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const delta = Math.round(-dx / pxPerYear);
    const nextY = Math.max(min, Math.min(max, startYear + delta));
    const pick = (el as any)._onPick as typeof onPick;
    pick(nextY);
  };
  const onUp = () => {
    dragging = false;
    inner.style.cursor = "grab";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  inner.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startYear = Number(el.querySelector(".year-chip.focus")?.getAttribute("data-year")) || current;
    inner.style.cursor = "grabbing";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  if (!el.dataset.wheelBound) {
    el.dataset.wheelBound = "1";
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const step = Math.abs(e.deltaY) > 80 ? 2 : 1;
        const focused = Number(el.querySelector(".year-chip.focus")?.getAttribute("data-year"));
        const cur = Number.isFinite(focused) ? focused : Number((el as any)._min);
        const pick = (el as any)._onPick as typeof onPick;
        if (!pick) return;
        pick(Math.max((el as any)._min, Math.min((el as any)._max, cur + (e.deltaY > 0 ? step : -step))));
      },
      { passive: false }
    );
  }

  updateYearStripFocus(el, current);
}

export function updateYearStripFocus(el: HTMLElement, current: number) {
  const inner = el.querySelector(".year-strip-inner") as HTMLElement | null;
  if (!inner) return;
  inner.querySelectorAll(".year-chip").forEach((chip) => {
    const y = Number((chip as HTMLElement).dataset.year);
    const dist = Math.abs(y - current);
    (chip as HTMLElement).style.opacity = String(1 / (1 + 0.35 * dist));
    (chip as HTMLElement).style.transform =
      dist === 0 ? "scale(1.18)" : `scale(${Math.max(0.75, 1 - dist * 0.04)})`;
    chip.classList.toggle("focus", y === current);
  });
  const focus = inner.querySelector(".year-chip.focus") as HTMLElement | null;
  if (focus) {
    const mid = inner.clientWidth / 2;
    inner.scrollLeft = focus.offsetLeft - mid + focus.offsetWidth / 2;
  }
}
