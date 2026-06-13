function renderSelect(select, currentValue, defaultLabel, values) {
  const fragment = document.createDocumentFragment();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = defaultLabel;
  fragment.appendChild(allOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    fragment.appendChild(option);
  });

  select.replaceChildren(fragment);
  select.value = values.includes(currentValue) ? currentValue : "all";
}

function renderOptionSelect(select, currentValue, defaultLabel, options) {
  const fragment = document.createDocumentFragment();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = defaultLabel;
  fragment.appendChild(allOption);

  options.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    fragment.appendChild(option);
  });

  select.replaceChildren(fragment);
  select.value = options.some((option) => option.value === currentValue) ? currentValue : "all";
}

function closeCustomSelect(select) {
  const control = customSelectMap.get(select);
  if (!control) {
    return;
  }
  control.host.classList.remove("is-open");
  control.trigger.setAttribute("aria-expanded", "false");
  control.list.hidden = true;
}

function closeOtherCustomSelects(activeSelect) {
  [elements.sourceFilter, elements.folderFilter, elements.modelFilter, elements.favoriteFilter, elements.sortFilter].forEach((select) => {
    if (select && select !== activeSelect) {
      closeCustomSelect(select);
    }
  });
}

function bindCustomSelectGlobalEvents() {
  if (customSelectGlobalEventsBound) {
    return;
  }
  customSelectGlobalEventsBound = true;
  document.addEventListener("click", (event) => {
    [elements.sourceFilter, elements.folderFilter, elements.modelFilter, elements.favoriteFilter, elements.sortFilter].forEach((select) => {
      const control = select ? customSelectMap.get(select) : null;
      if (control && !control.host.contains(event.target)) {
        closeCustomSelect(select);
      }
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      [elements.sourceFilter, elements.folderFilter, elements.modelFilter, elements.favoriteFilter, elements.sortFilter].forEach(closeCustomSelect);
    }
  });
}

function initializeCustomSelect(select) {
  if (!select || customSelectMap.has(select)) {
    return customSelectMap.get(select) || null;
  }

  bindCustomSelectGlobalEvents();
  select.classList.add("native-select");

  const host = document.createElement("div");
  host.className = "custom-select";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const label = document.createElement("span");
  label.className = "custom-select-value";
  const chevron = document.createElement("span");
  chevron.className = "custom-select-chevron";
  chevron.setAttribute("aria-hidden", "true");
  trigger.append(label, chevron);

  const list = document.createElement("div");
  list.className = "custom-select-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const isOpen = host.classList.contains("is-open");
    closeOtherCustomSelects(select);
    host.classList.toggle("is-open", !isOpen);
    trigger.setAttribute("aria-expanded", String(!isOpen));
    list.hidden = isOpen;
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      trigger.click();
    }
  });

  host.append(trigger, list);
  select.insertAdjacentElement("afterend", host);
  const control = { host, trigger, label, list };
  customSelectMap.set(select, control);
  return control;
}

function syncCustomSelect(select) {
  const control = initializeCustomSelect(select);
  if (!control) {
    return;
  }

  const selectedOption = select.options[select.selectedIndex] || select.options[0] || null;
  control.label.textContent = selectedOption?.textContent || "";
  control.trigger.disabled = select.disabled || select.options.length === 0;
  control.list.replaceChildren();

  Array.from(select.options).forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "custom-select-option";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(option.value === select.value));
    item.textContent = option.textContent;
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeCustomSelect(select);
      syncCustomSelect(select);
    });
    control.list.appendChild(item);
  });
}

function syncCustomSelects() {
  [elements.sourceFilter, elements.folderFilter, elements.modelFilter, elements.favoriteFilter, elements.sortFilter].forEach(syncCustomSelect);
}

