
let openViewerHandler = () => {};
const galleryNodeMap = new Map();
let detailCopyHandler = () => {};
let galleryEventsBound = false;
let renderFrame = 0;
const customSelectMap = new WeakMap();
let customSelectGlobalEventsBound = false;

function setOpenViewerHandler(handler) {
  openViewerHandler = typeof handler === "function" ? handler : () => {};
}

function setDetailCopyHandler(handler) {
  detailCopyHandler = typeof handler === "function" ? handler : () => {};
}

function getAllTags() {
  return [...new Set(state.items.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b));
}

function getAllModels() {
  return [...new Set(state.items.map((item) => item.model).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getAllSources() {
  return [...new Set(state.items.map((item) => item.sourceType).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getFolderFilterValue(item) {
  return `${item.rootId || "unrooted"}::${item.folderPath || ""}`;
}

function getFolderLabel(item) {
  const rootName = item.rootName || "未分组";
  const folderName = item.folderPath || "根目录级文件";
  return `${rootName} / ${folderName}`;
}

function getAllFolderOptions() {
  const optionMap = new Map();
  state.items.forEach((item) => {
    const value = getFolderFilterValue(item);
    if (!optionMap.has(value)) {
      optionMap.set(value, getFolderLabel(item));
    }
  });
  return [...optionMap.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function getFilteredItems() {
  const query = state.searchQuery.trim().toLowerCase();
  return state.items
    .filter((item) => {
      if (state.activeTag !== "all" && !item.tags.includes(state.activeTag)) {
        return false;
      }
      if (state.sourceFilter !== "all" && item.sourceType !== state.sourceFilter) {
        return false;
      }
      if (state.folderFilter !== "all" && getFolderFilterValue(item) !== state.folderFilter) {
        return false;
      }
      if (state.modelFilter !== "all" && item.model !== state.modelFilter) {
        return false;
      }
      if (state.favoriteFilter === "favorites" && !item.favorite) {
        return false;
      }
      if (state.favoriteFilter === "others" && item.favorite) {
        return false;
      }
      if (!query) {
        return true;
      }

      return (item.searchText || buildItemSearchText(item)).includes(query);
    })
    .sort((left, right) => {
      if (state.sortOrder === "oldest") {
        return (left.createdAtTime || getCreatedAtTime(left.createdAt)) - (right.createdAtTime || getCreatedAtTime(right.createdAt));
      }
      if (state.sortOrder === "favorites") {
        if (left.favorite === right.favorite) {
          return (right.createdAtTime || getCreatedAtTime(right.createdAt)) - (left.createdAtTime || getCreatedAtTime(left.createdAt));
        }
        return Number(right.favorite) - Number(left.favorite);
      }
      if (state.sortOrder === "title") {
        return left.title.localeCompare(right.title);
      }
      return (right.createdAtTime || getCreatedAtTime(right.createdAt)) - (left.createdAtTime || getCreatedAtTime(left.createdAt));
    });
}

function getSelectedItem() {
  return state.items.find((item) => item.id === state.selectedId) || null;
}

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

function renderTagFilters() {
  const tags = getAllTags();
  const fragment = document.createDocumentFragment();

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `chip${state.activeTag === "all" ? " active" : ""}`;
  allButton.textContent = "全部";
  allButton.addEventListener("click", () => {
    state.activeTag = "all";
    requestRender();
  });
  fragment.appendChild(allButton);

  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${state.activeTag === tag ? " active" : ""}`;
    button.textContent = tag;
    button.addEventListener("click", () => {
      state.activeTag = tag;
      requestRender();
    });
    fragment.appendChild(button);
  });

  elements.tagFilters.replaceChildren(fragment);
}

function renderFilters() {
  renderSelect(elements.sourceFilter, state.sourceFilter, "全部来源", getAllSources());
  state.sourceFilter = elements.sourceFilter.value;

  const folderOptions = getAllFolderOptions();
  renderOptionSelect(elements.folderFilter, state.folderFilter, "全部文件夹", folderOptions);
  state.folderFilter = elements.folderFilter.value;

  renderSelect(elements.modelFilter, state.modelFilter, "全部模型", getAllModels());
  state.modelFilter = elements.modelFilter.value;

  syncCustomSelects();
}

function renderStats() {
  const filteredItems = getFilteredItems();
  elements.assetCount.textContent = String(filteredItems.length);
  elements.favoriteCount.textContent = String(filteredItems.filter((item) => item.favorite).length);
  elements.modelCount.textContent = String(getAllFolderOptions().length);
}

function getGalleryImageSource(item) {
  if (item.thumbnailImage) {
    return item.thumbnailImage;
  }
  return item.imageBlob ? "" : item.image;
}

function updateGalleryThumbnail(item) {
  const node = galleryNodeMap.get(item?.id);
  if (!node) {
    return;
  }

  const thumbImage = node.querySelector(".gallery-thumb-image");
  if (!thumbImage) {
    return;
  }

  const galleryImage = getGalleryImageSource(item);
  node.classList.toggle("thumbnail-pending", Boolean(item.imageBlob && !item.thumbnailImage));
  if (galleryImage) {
    if (thumbImage.getAttribute("src") !== galleryImage) {
      thumbImage.src = galleryImage;
    }
    thumbImage.hidden = false;
  } else {
    thumbImage.removeAttribute("src");
    thumbImage.hidden = true;
  }
}

function renderGallery() {
  const filteredItems = getFilteredItems();
  bindGalleryEvents();
  const previousNodeMap = new Map(galleryNodeMap);
  galleryNodeMap.clear();
  elements.emptyState.hidden = filteredItems.length > 0;
  elements.resultSummary.textContent = `${filteredItems.length} 个结果`;

  if (filteredItems.length === 0) {
    state.selectedId = null;
  } else if (!filteredItems.some((item) => item.id === state.selectedId)) {
    state.selectedId = filteredItems[0].id;
  }

  const activeIds = new Set();
  let cursor = elements.galleryGrid.firstElementChild;
  filteredItems.forEach((item, index) => {
    activeIds.add(item.id);
    const existingNode = previousNodeMap.get(item.id) || null;
    const node = existingNode || elements.galleryItemTemplate.content.firstElementChild.cloneNode(true);
    const animationDelay = Math.min(index * GALLERY_ANIMATION_DELAY_STEP_MS, GALLERY_ANIMATION_DELAY_MAX_MS);
    node.style.setProperty("--delay", existingNode ? "0ms" : `${animationDelay}ms`);
    node.classList.toggle("is-reused", Boolean(existingNode));
    node.classList.toggle("selected", item.id === state.selectedId);
    node.dataset.id = item.id;
    const thumbImage = node.querySelector(".gallery-thumb-image");
    thumbImage.alt = item.title ? `${item.title} 缩略图` : "";
    galleryNodeMap.set(item.id, node);
    updateGalleryThumbnail(item);
    const folderLabel = item.folderPath || item.rootName || item.model;
    node.querySelector(".gallery-model").textContent = `${item.sourceType} · ${folderLabel || "未分组"}`;
    node.querySelector(".gallery-title").textContent = item.title;
    node.querySelector(".gallery-tags").textContent = item.tags.slice(0, 3).join(" · ") || "无 TAG";
    node.querySelector(".gallery-favorite").style.visibility = item.favorite ? "visible" : "hidden";
    if (node !== cursor) {
      elements.galleryGrid.insertBefore(node, cursor);
    } else {
      cursor = cursor.nextElementSibling;
    }
  });

  Array.from(elements.galleryGrid.children).forEach((node) => {
    if (!activeIds.has(node.dataset.id)) {
      node.remove();
    }
  });
}

function bindGalleryEvents() {
  if (galleryEventsBound) {
    return;
  }

  galleryEventsBound = true;
  elements.galleryGrid.addEventListener("click", (event) => {
    const node = event.target.closest(".gallery-item");
    if (!node || !elements.galleryGrid.contains(node)) {
      return;
    }
    openViewerHandler(node.dataset.id);
  });
}

function syncGallerySelection(previousId = null) {
  if (previousId && previousId !== state.selectedId) {
    galleryNodeMap.get(previousId)?.classList.remove("selected");
  }
  galleryNodeMap.get(state.selectedId)?.classList.add("selected");
}

function renderTagCloud(tags) {
  if (!tags.length) {
    return '<p class="detail-copy">未提取到 TAG</p>';
  }
  return `<div class="tag-cloud">${tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function renderParameterGrid(item) {
  const entries = [
    ["Source", item.sourceType || "Unknown"],
    ["Filename", item.filename || "未记录"],
    ["Root", item.rootName || "未记录"],
    ["Folder", item.folderPath || "根目录级文件"],
    ["Relative Path", item.relativePath || "未记录"],
    ["Model", item.model || "Unknown"],
    ["Size", item.size || "未记录"],
    ["Sampler", item.sampler || "未记录"],
    ["Scheduler", item.scheduler || "未记录"],
    ["Steps", item.steps || "未记录"],
    ["CFG", item.cfg || "未记录"],
    ["Seed", item.seed || "未记录"],
  ];

  return `<div class="parameter-grid">${entries
    .map(
      ([label, value]) => `
        <div class="parameter-card">
          <strong>${escapeHtml(label)}</strong>
          <p>${escapeHtml(value)}</p>
        </div>
      `
    )
    .join("")}</div>`;
}

function renderPromptBlock(label, value, fallback, copyType) {
  const displayValue = value || fallback;
  const copyDisabled = value ? "" : " disabled";
  const copyLabel = `复制 ${label}`;
  return `
    <div class="prompt-block">
      <div class="prompt-block-head">
        <strong>${escapeHtml(label)}</strong>
        <button class="detail-copy-button" type="button" data-copy-detail="${copyType}" aria-label="${escapeHtml(copyLabel)}" title="${escapeHtml(copyLabel)}"${copyDisabled}>
          <svg class="detail-copy-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 8.5h9.5v9.5H8z" />
            <path d="M5.5 15.5V5.5h10" />
          </svg>
        </button>
      </div>
      <p>${escapeHtml(displayValue)}</p>
    </div>
  `;
}

function bindDetailCopyButtons() {
  elements.detailPanel.querySelectorAll("[data-copy-detail]").forEach((copyButton) => {
    copyButton.addEventListener("click", () => {
      const copyType = copyButton.dataset.copyDetail;
      const label = copyType === "negativePrompt" ? "Negative Prompt" : "Prompt";
      detailCopyHandler(copyType, label);
    });
  });
}

function renderLazyRawBlock(label, fieldName) {
  return `
    <details class="metadata-raw" data-raw-field="${fieldName}">
      <summary>${escapeHtml(label)}</summary>
      <pre data-raw-content></pre>
    </details>
  `;
}

function bindRawMetadataBlocks(item) {
  elements.detailPanel.querySelectorAll("[data-raw-field]").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open) {
        return;
      }
      const content = details.querySelector("[data-raw-content]");
      if (!content || content.dataset.loaded === "true") {
        return;
      }
      content.textContent = item[details.dataset.rawField] || "";
      content.dataset.loaded = "true";
    });
  });
}

function setDetailPreviewImage(image) {
  if (typeof setViewerZoomImage === "function") {
    setViewerZoomImage(image || "");
    return;
  }
  elements.previewImage.style.backgroundImage = image ? `url("${image}")` : "";
}

function renderDetail() {
  const selected = getSelectedItem();
  if (!selected) {
    setDetailPreviewImage("");
    elements.detailPanel.innerHTML = '<p class="detail-copy">请选择一张图片查看详情。</p>';
    elements.favoriteToggleButton.disabled = true;
    elements.copyImageButton.disabled = true;
    elements.favoriteToggleButton.classList.remove("is-active");
    elements.favoriteToggleButton.setAttribute("aria-label", "收藏");
    elements.favoriteToggleButton.title = "收藏";
    return;
  }

  elements.favoriteToggleButton.disabled = false;
  elements.copyImageButton.disabled = !(selected.image || selected.imageBlob || selected.storageMode === "directory");
  elements.favoriteToggleButton.classList.toggle("is-active", selected.favorite);
  elements.favoriteToggleButton.setAttribute("aria-label", selected.favorite ? "取消收藏" : "收藏");
  elements.favoriteToggleButton.title = selected.favorite ? "取消收藏" : "收藏";
  setDetailPreviewImage(selected.image || selected.thumbnailImage);

  const rawMetadataBlock = selected.metadataRaw ? renderLazyRawBlock("Raw Metadata", "metadataRaw") : "";
  const workflowBlock = selected.workflowRaw ? renderLazyRawBlock("Workflow", "workflowRaw") : "";

  elements.detailPanel.innerHTML = `
    <h3 id="viewerTitle">${escapeHtml(selected.title)}</h3>
    <div class="detail-meta">
      <span>${escapeHtml(selected.sourceType || "Unknown")}</span>
      <span>${escapeHtml(selected.model || "Unknown")}</span>
      <span>${escapeHtml(selected.folderPath || selected.rootName || "未分组")}</span>
      <span>${escapeHtml(selected.size || "未填写尺寸")}</span>
      <span>${new Date(selected.createdAt).toLocaleDateString("zh-CN")}</span>
    </div>
    ${renderPromptBlock("Prompt", selected.prompt, "未提取到 Prompt", "prompt")}
    ${renderPromptBlock("Negative Prompt", selected.negativePrompt, "未提取到 Negative Prompt", "negativePrompt")}
    <div class="prompt-block">
      <strong>Tags</strong>
      ${renderTagCloud(selected.tags)}
    </div>
    ${renderParameterGrid(selected)}
    <p class="detail-copy">${escapeHtml(selected.notes || "暂无备注")}</p>
    ${rawMetadataBlock}
    ${workflowBlock}
  `;
  bindDetailCopyButtons();
  bindRawMetadataBlocks(selected);
}

function renderViewer() {
  if (state.viewerOpen) {
    renderDetail();
    elements.viewerModal.hidden = false;
  } else {
    elements.viewerModal.hidden = true;
  }
  queueScrollbarMaskSync();
}

function render() {
  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  }
  renderTagFilters();
  renderFilters();
  renderStats();
  renderGallery();
  renderViewer();
}

function requestRender() {
  if (renderFrame) {
    return;
  }

  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = 0;
    render();
  });
}


