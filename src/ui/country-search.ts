import { t } from "../i18n";

export function initCountrySearch({
  input,
  list,
  names: initialNames,
  labelFor = (n: string) => n,
  tokensFor = () => "",
  descriptionFor,
  onSelect,
  initial = null,
}: {
  input: HTMLInputElement;
  list: HTMLElement;
  names: string[];
  labelFor?: (n: string) => string;
  tokensFor?: (n: string) => string;
  descriptionFor?: (n: string) => string;
  onSelect: (name: string) => void;
  initial?: string | null;
}) {
  let names = initialNames.slice();
  let activeIndex = -1;
  let filtered = names.slice();
  let open = false;

  function setValue(name: string, fire = true) {
    if (!name || !names.includes(name)) return;
    input.value = labelFor(name);
    input.dataset.value = name;
    close();
    if (fire) {
      onSelect(name);
      // Drop the caret so the next click focuses the field again and
      // reopens the list. Defer until after the pointer gesture so the
      // map under the dropdown does not receive the leftover click.
      window.setTimeout(() => {
        if (document.activeElement === input) input.blur();
      }, 0);
    }
  }

  function openList() {
    open = true;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function close() {
    open = false;
    list.hidden = true;
    activeIndex = -1;
    input.setAttribute("aria-expanded", "false");
  }

  function queryForOpen() {
    const raw = input.value;
    return input.dataset.value && raw === labelFor(input.dataset.value) ? "" : raw;
  }

  function showList() {
    const q = queryForOpen();
    if (input.dataset.value && input.value === labelFor(input.dataset.value)) input.select();
    renderList(q);
  }

  function renderList(query = "") {
    const q = query.trim().toLowerCase();
    filtered = names.filter((n) => {
      if (!q) return true;
      const label = labelFor(n).toLowerCase();
      const tokens = tokensFor(n).toLowerCase();
      if (n.toLowerCase().includes(q) || label.includes(q) || tokens.includes(q)) return true;
      const parts = tokens.split(/[\s,;/]+/).filter(Boolean);
      return parts.some((p) => p === q || p.startsWith(q));
    });
    if (q) {
      filtered.sort((a, b) => {
        const score = (n: string) => {
          const t = tokensFor(n).toLowerCase().split(/[\s,;/]+/);
          if (t.includes(q)) return 0;
          if (t.some((p) => p.startsWith(q))) return 1;
          if (n.toLowerCase().startsWith(q)) return 2;
          return 3;
        };
        return score(a) - score(b) || a.localeCompare(b);
      });
    }
    list.innerHTML = "";
    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "country-list-empty";
      li.textContent = t("country.noMatches");
      list.appendChild(li);
      openList();
      return;
    }
    filtered.slice(0, 80).forEach((name, i) => {
      const li = document.createElement("li");
      li.className = "country-list-item";
      li.setAttribute("role", "option");
      li.dataset.name = name;
      const label = labelFor(name);
      const desc = descriptionFor?.(name) || "";
      if (desc) {
        li.classList.add("has-desc");
        const title = document.createElement("span");
        title.className = "country-list-label";
        title.textContent = label;
        const sub = document.createElement("span");
        sub.className = "country-list-desc";
        sub.textContent = desc;
        li.append(title, sub);
        li.setAttribute("data-tip", desc);
        li.title = desc;
      } else {
        li.textContent = label;
      }
      if (i === activeIndex) li.classList.add("active");
      if (name === input.dataset.value) li.classList.add("selected");
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        setValue(name, true);
      });
      list.appendChild(li);
    });
    openList();
  }

  input.addEventListener("focus", () => {
    showList();
  });
  input.addEventListener("mousedown", () => {
    if (open) return;
    // Already focused: `focus` will not fire, so open on press.
    if (document.activeElement === input) showList();
  });
  input.addEventListener("input", () => {
    activeIndex = -1;
    renderList(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) renderList(input.value);
      activeIndex = Math.min(filtered.length - 1, activeIndex + 1);
      [...list.querySelectorAll(".country-list-item")].forEach((el, i) =>
        el.classList.toggle("active", i === activeIndex)
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) setValue(filtered[activeIndex], true);
    } else if (e.key === "Escape") {
      close();
      if (input.dataset.value) input.value = labelFor(input.dataset.value);
    }
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      close();
      if (input.dataset.value) input.value = labelFor(input.dataset.value);
    }, 150);
  });
  if (initial && names.includes(initial)) setValue(initial, false);

  return {
    setValue: (name: string) => setValue(name, false),
    getValue: () => input.dataset.value || null,
    refreshNames: (next: string[]) => {
      names = next;
    },
  };
}
