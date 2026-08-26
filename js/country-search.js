/**
 * Searchable country combobox bound to a hidden <select> (or value callback).
 */

/**
 * @param {object} opts
 * @param {HTMLInputElement} opts.input
 * @param {HTMLElement} opts.list
 * @param {HTMLSelectElement} [opts.select] - kept in sync when present
 * @param {string[]} opts.names
 * @param {(name: string) => string} [opts.labelFor] - display label
 * @param {(name: string) => void} opts.onSelect
 * @param {string} [opts.initial]
 */
export function initCountrySearch({
  input,
  list,
  select,
  names: initialNames,
  labelFor = (n) => n,
  onSelect,
  initial = null,
}) {
  let names = initialNames.slice();
  let activeIndex = -1;
  let filtered = names.slice();
  let open = false;

  function setValue(name, fire = true) {
    if (!name || !names.includes(name)) return;
    input.value = labelFor(name);
    input.dataset.value = name;
    if (select) select.value = name;
    close();
    if (fire) onSelect(name);
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

  function renderList(query = "") {
    const q = query.trim().toLowerCase();
    // Strip leading emoji / symbols for matching
    filtered = names.filter((n) => {
      const label = labelFor(n).toLowerCase();
      return (
        !q ||
        n.toLowerCase().includes(q) ||
        label.includes(q) ||
        label.replace(/^[^\p{L}\p{N}]+/u, "").includes(q)
      );
    });

    list.innerHTML = "";
    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "country-list-empty";
      li.textContent = "No matches";
      list.appendChild(li);
      openList();
      return;
    }

    filtered.slice(0, 80).forEach((name, i) => {
      const li = document.createElement("li");
      li.className = "country-list-item";
      li.setAttribute("role", "option");
      li.dataset.name = name;
      li.textContent = labelFor(name);
      if (i === activeIndex) li.classList.add("active");
      if (name === input.dataset.value) li.classList.add("selected");
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus handling clean
        setValue(name, true);
      });
      list.appendChild(li);
    });
    openList();
  }

  function moveActive(delta) {
    if (!filtered.length) return;
    const max = Math.min(filtered.length, 80) - 1;
    activeIndex = Math.max(0, Math.min(max, activeIndex + delta));
    [...list.querySelectorAll(".country-list-item")].forEach((el, i) => {
      el.classList.toggle("active", i === activeIndex);
      if (i === activeIndex) el.scrollIntoView({ block: "nearest" });
    });
  }

  input.addEventListener("focus", () => {
    // Show full list on focus if empty query
    const raw = input.value;
    const q =
      input.dataset.value && raw === labelFor(input.dataset.value) ? "" : raw;
    if (input.dataset.value && raw === labelFor(input.dataset.value)) {
      // select all for quick retype
      input.select();
    }
    renderList(q);
  });

  input.addEventListener("input", () => {
    activeIndex = -1;
    renderList(input.value);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) renderList(input.value);
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) {
        setValue(filtered[activeIndex], true);
      } else if (filtered.length === 1) {
        setValue(filtered[0], true);
      } else {
        // exact match by name
        const exact = names.find(
          (n) =>
            n.toLowerCase() === input.value.trim().toLowerCase() ||
            labelFor(n).toLowerCase() === input.value.trim().toLowerCase()
        );
        if (exact) setValue(exact, true);
      }
    } else if (e.key === "Escape") {
      close();
      if (input.dataset.value) input.value = labelFor(input.dataset.value);
    }
  });

  input.addEventListener("blur", () => {
    // delay so mousedown on item can fire
    setTimeout(() => {
      close();
      if (input.dataset.value) input.value = labelFor(input.dataset.value);
    }, 150);
  });

  if (initial && names.includes(initial)) {
    setValue(initial, false);
  }

  return {
    setValue: (name) => setValue(name, false),
    getValue: () => input.dataset.value || null,
    refreshNames: (next) => {
      names = next;
    },
  };
}
