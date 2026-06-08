
let openViewerHandler = () => {};
const galleryNodeMap = new Map();
let detailCopyHandler = () => {};

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

      const haystack = [
        item.title,
        item.prompt,
        item.negativePrompt,
        item.model,
        item.notes,
        item.sourceType,
        item.filename,
        item.sampler,
        item.scheduler,
        item.steps,
        item.seed,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .sort((left, right) => {
      if (state.sortOrder === "oldest") {
        return new Date(left.createdAt) - new Date(right.createdAt);
      }
      if (state.sortOrder === "favorites") {
        if (left.favorite === right.favorite) {
          return new Date(right.createdAt) - new Date(left.createdAt);
        }
        return Number(right.favorite) - Number(left.favorite);
      }
      if (state.sortOrder === "title") {
        return left.title.localeCompare(right.title);
      }
      return new Date(right.createdAt) - new Date(left.createdAt);
    });
}

function getSelectedItem() {
  return state.items.find((item) => item.id === state.selectedId) || null;
}

function renderSelect(select, currentValue, defaultLabel, values) {
  select.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = defaultLabel;
  select.appendChild(allOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  select.value = values.includes(currentValue) ? currentValue : "all";
}

function renderTagFilters() {
  const tags = getAllTags();
  elements.tagFilters.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `chip${state.activeTag === "all" ? " active" : ""}`;
  allButton.textContent = "全部";
  allButton.addEventListener("click", () => {
    state.activeTag = "all";
    render();
  });
  elements.tagFilters.appendChild(allButton);

  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${state.activeTag === tag ? " active" : ""}`;
    button.textContent = tag;
    button.addEventListener("click", () => {
      state.activeTag = tag;
      render();
    });
    elements.tagFilters.appendChild(button);
  });
}

function renderFilters() {
  renderSelect(elements.sourceFilter, state.sourceFilter, "全部来源", getAllSources());
  state.sourceFilter = elements.sourceFilter.value;

  renderSelect(elements.modelFilter, state.modelFilter, "全部模型", getAllModels());
  state.modelFilter = elements.modelFilter.value;
}

function renderStats() {
  elements.assetCount.textContent = String(state.items.length);
  elements.favoriteCount.textContent = String(state.items.filter((item) => item.favorite).length);
  elements.modelCount.textContent = String(getAllModels().length);
}

function renderGallery() {
  const filteredItems = getFilteredItems();
  elements.galleryGrid.innerHTML = "";
  galleryNodeMap.clear();
  elements.emptyState.hidden = filteredItems.length > 0;
  elements.resultSummary.textContent = `${filteredItems.length} 个结果`;

  if (!filteredItems.some((item) => item.id === state.selectedId)) {
    state.selectedId = filteredItems[0]?.id || state.items[0]?.id || null;
  }

  filteredItems.forEach((item, index) => {
    const node = elements.galleryItemTemplate.content.firstElementChild.cloneNode(true);
    node.style.setProperty("--delay", `${index * 8}ms`);
    node.classList.toggle("selected", item.id === state.selectedId);
    node.dataset.id = item.id;
    node.querySelector(".gallery-thumb").style.backgroundImage = item.image ? `url("${item.image}")` : "";
    node.querySelector(".gallery-model").textContent = `${item.sourceType} · ${item.model}`;
    node.querySelector(".gallery-title").textContent = item.title;
    node.querySelector(".gallery-tags").textContent = item.tags.slice(0, 3).join(" · ") || "无 TAG";
    node.querySelector(".gallery-favorite").style.visibility = item.favorite ? "visible" : "hidden";
    node.addEventListener("click", () => openViewerHandler(item.id));
    galleryNodeMap.set(item.id, node);
    elements.galleryGrid.appendChild(node);
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

function renderDetail() {
  const selected = getSelectedItem();
  if (!selected) {
    elements.previewImage.style.backgroundImage = "";
    elements.detailPanel.innerHTML = '<p class="detail-copy">请选择一张图片查看详情。</p>';
    elements.favoriteToggleButton.disabled = true;
    elements.copyImageButton.disabled = true;
    elements.favoriteToggleButton.classList.remove("is-active");
    elements.favoriteToggleButton.setAttribute("aria-label", "收藏");
    elements.favoriteToggleButton.title = "收藏";
    return;
  }

  elements.favoriteToggleButton.disabled = false;
  elements.copyImageButton.disabled = !selected.image;
  elements.favoriteToggleButton.classList.toggle("is-active", selected.favorite);
  elements.favoriteToggleButton.setAttribute("aria-label", selected.favorite ? "取消收藏" : "收藏");
  elements.favoriteToggleButton.title = selected.favorite ? "取消收藏" : "收藏";
  elements.previewImage.style.backgroundImage = selected.image ? `url("${selected.image}")` : "";

  const rawMetadataBlock = selected.metadataRaw
    ? `
      <details class="metadata-raw">
        <summary>Raw Metadata</summary>
        <pre>${escapeHtml(selected.metadataRaw)}</pre>
      </details>
    `
    : "";

  const workflowBlock = selected.workflowRaw
    ? `
      <details class="metadata-raw">
        <summary>Workflow</summary>
        <pre>${escapeHtml(selected.workflowRaw)}</pre>
      </details>
    `
    : "";

  elements.detailPanel.innerHTML = `
    <h3 id="viewerTitle">${escapeHtml(selected.title)}</h3>
    <div class="detail-meta">
      <span>${escapeHtml(selected.sourceType || "Unknown")}</span>
      <span>${escapeHtml(selected.model || "Unknown")}</span>
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
  renderStats();
  renderTagFilters();
  renderFilters();
  renderGallery();
  renderViewer();
}


