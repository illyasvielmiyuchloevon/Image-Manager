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
