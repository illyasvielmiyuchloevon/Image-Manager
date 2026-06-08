
function setImportStatus(message) {
  elements.importStatus.textContent = message;
}

function resetDraftState() {
  if (state.draftObjectUrl) {
    URL.revokeObjectURL(state.draftObjectUrl);
    state.draftObjectUrl = "";
  }
  state.draftBlob = null;
  state.draftMetadata = null;
}

function refreshUploadPreview(image) {
  if (image) {
    elements.uploadPreview.style.backgroundImage = `url("${image}")`;
    elements.uploadPreview.textContent = "";
  } else {
    elements.uploadPreview.style.backgroundImage = "";
    elements.uploadPreview.textContent = "暂无预览";
  }
}

function populateForm(item) {
  if (!item) {
    elements.formHeading.textContent = "新增作品";
    elements.entryId.value = "";
    elements.entryForm.reset();
    resetDraftState();
    refreshUploadPreview("");
    return;
  }

  elements.formHeading.textContent = "编辑作品";
  elements.entryId.value = item.id;
  elements.titleInput.value = item.title;
  elements.imageUrlInput.value = item.imageBlob ? "" : item.image;
  elements.promptInput.value = item.prompt;
  elements.negativePromptInput.value = item.negativePrompt;
  elements.modelInput.value = item.model === "Unknown" ? "" : item.model;
  elements.sizeInput.value = item.size;
  elements.tagsInput.value = item.tags.join(", ");
  elements.notesInput.value = item.notes;
  resetDraftState();
  state.draftBlob = item.imageBlob || null;
  state.draftMetadata = item;
  refreshUploadPreview(item.image);
}

function openViewer(id) {
  const previousId = state.selectedId;
  if (id) {
    state.selectedId = id;
  }
  if (!state.selectedId) {
    return;
  }
  state.viewerOpen = true;
  document.body.style.overflow = "hidden";
  syncGallerySelection(previousId);
  renderViewer();
}

function closeViewer() {
  state.viewerOpen = false;
  if (typeof resetViewerZoom === "function") {
    resetViewerZoom();
  }
  elements.viewerModal.hidden = true;
  document.body.style.overflow = state.editorOpen ? "hidden" : "";
  queueScrollbarMaskSync();
}

function openEditor(item = null) {
  state.editorOpen = true;
  elements.editorPanel.hidden = false;
  document.body.style.overflow = "hidden";
  populateForm(item);
  queueScrollbarMaskSync();
}

function closeEditor() {
  state.editorOpen = false;
  elements.editorPanel.hidden = true;
  elements.entryForm.reset();
  elements.entryId.value = "";
  resetDraftState();
  refreshUploadPreview("");
  document.body.style.overflow = state.viewerOpen ? "hidden" : "";
  queueScrollbarMaskSync();
}

async function upsertItem(item) {
  const existingIndex = state.items.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    const previous = state.items[existingIndex];
    if (previous.imageBlob && item.imageBlob && previous.imageBlob !== item.imageBlob) {
      revokeObjectUrl(previous.id);
    }
    item.favorite = previous.favorite;
    state.items.splice(existingIndex, 1, item);
  } else {
    state.items.unshift(item);
  }
  state.selectedId = item.id;
  await saveItem(item);
}

async function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(elements.entryForm);
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const currentItem = state.items.find((item) => item.id === elements.entryId.value) || null;
  const title = String(formData.get("title") || "").trim();
  if (!title) {
    window.alert("请填写标题。");
    return;
  }

  const remoteUrl = String(formData.get("imageUrl") || "").trim();
  const imageBlob = state.draftBlob || currentItem?.imageBlob || null;
  const id = elements.entryId.value || crypto.randomUUID();
  let image = "";

  if (imageBlob) {
    image = createObjectUrl(id, imageBlob);
  } else if (remoteUrl) {
    image = remoteUrl;
  }

  if (!image) {
    window.alert("请先上传图片或填写图片 URL。");
    return;
  }

  const prompt = String(formData.get("prompt") || "").trim();
  const payload = normalizeItem({
    id,
    title,
    image,
    imageBlob,
    prompt,
    negativePrompt: formData.get("negativePrompt"),
    model: formData.get("model") || state.draftMetadata?.model || currentItem?.model || "Unknown",
    size: formData.get("size") || state.draftMetadata?.size || currentItem?.size || "",
    tags: tags.length ? tags : inferTags(prompt),
    notes: formData.get("notes"),
    favorite: currentItem?.favorite || false,
    createdAt: currentItem?.createdAt || new Date().toISOString(),
    sourceType: state.draftMetadata?.sourceType || currentItem?.sourceType || (imageBlob ? "Manual" : "Remote URL"),
    filename: state.draftMetadata?.filename || currentItem?.filename || "",
    sampler: state.draftMetadata?.sampler || currentItem?.sampler || "",
    scheduler: state.draftMetadata?.scheduler || currentItem?.scheduler || "",
    steps: state.draftMetadata?.steps || currentItem?.steps || "",
    cfg: state.draftMetadata?.cfg || currentItem?.cfg || "",
    seed: state.draftMetadata?.seed || currentItem?.seed || "",
    metadataRaw: state.draftMetadata?.metadataRaw || currentItem?.metadataRaw || "",
    workflowRaw: state.draftMetadata?.workflowRaw || currentItem?.workflowRaw || "",
  });

  await upsertItem(payload);
  closeEditor();
  setImportStatus(`已保存：${payload.title}`);
  render();
}

async function handleEditorImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  setImportStatus(`正在解析 ${file.name} ...`);
  try {
    const item = await createItemFromFile(file);
    state.draftBlob = file;
    state.draftMetadata = item;
    if (state.draftObjectUrl) {
      URL.revokeObjectURL(state.draftObjectUrl);
    }
    state.draftObjectUrl = URL.createObjectURL(file);
    elements.titleInput.value = item.title;
    elements.promptInput.value = item.prompt;
    elements.negativePromptInput.value = item.negativePrompt;
    elements.modelInput.value = item.model === "Unknown" ? "" : item.model;
    elements.sizeInput.value = item.size;
    elements.tagsInput.value = item.tags.join(", ");
    elements.notesInput.value = item.notes;
    elements.imageUrlInput.value = "";
    refreshUploadPreview(state.draftObjectUrl);
    setImportStatus(`已识别 ${item.sourceType} 元数据：${file.name}`);
  } catch (error) {
    console.error(error);
    setImportStatus(`解析失败：${file.name}`);
    window.alert("图片解析失败，请确认文件是否完整。");
  } finally {
    elements.imageUploadInput.value = "";
  }
}

async function handleBulkImageImport(event, options = {}) {
  const sourceLabel = options.sourceLabel || "图片";
  const files = Array.from(event.target.files || []).filter(isSupportedImageFile);
  if (files.length === 0) {
    setImportStatus(`没有可导入的${sourceLabel}文件。`);
    return;
  }

  const startedAt = performance.now();
  setImportStatus(`正在导入 ${files.length} 个${sourceLabel}文件...`);

  try {
    const importedItems = await mapConcurrent(
      files,
      IMPORT_CONCURRENCY,
      async (file) => createItemFromFile(file),
      (done, total) => {
        if (done === total || done % 25 === 0) {
          setImportStatus(`正在导入 ${done}/${total} 个${sourceLabel}文件...`);
        }
      }
    );

    state.items = [...importedItems, ...state.items];
    state.selectedId = importedItems[0]?.id ?? state.selectedId;
    await saveItems(importedItems);
    render();

    const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
    const rate = (importedItems.length / elapsedSeconds).toFixed(1);
    setImportStatus(`已导入 ${importedItems.length} 个${sourceLabel}文件，用时 ${elapsedSeconds.toFixed(2)}s，约 ${rate} 张/秒。`);
  } catch (error) {
    console.error(error);
    setImportStatus("批量导入失败。");
    window.alert("批量导入失败，请重试。");
  } finally {
    elements.bulkImageInput.value = "";
  }
}

async function toggleFavorite() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }
  selected.favorite = !selected.favorite;
  await saveItem(selected);
  render();
}

function getDetailCopyText(copyType) {
  const selected = getSelectedItem();
  if (!selected) {
    return "";
  }
  if (copyType === "negativePrompt") {
    return selected.negativePrompt || "";
  }
  return selected.prompt || "";
}

async function copyTextToClipboard(text, label) {
  if (!text) {
    window.alert(`${label} 为空，暂无可复制内容。`);
    return;
  }

  try {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (error) {
        console.warn("Clipboard API text copy failed, falling back to textarea copy.", error);
      }
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
    }

    if (!copied) {
      throw new Error("复制命令未成功执行");
    }
    setImportStatus(`已复制 ${label}。`);
  } catch (error) {
    console.error(error);
    window.alert(`复制 ${label} 失败，请手动选中文本复制。`);
  }
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    if (/^https?:\/\//i.test(source)) {
      image.crossOrigin = "anonymous";
    }
    image.src = source;
  });
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("图片转换失败"));
      }
    }, type);
  });
}

async function createClipboardImageBlob(item) {
  let source = item.image;
  let objectUrl = "";
  if (item.imageBlob) {
    objectUrl = URL.createObjectURL(item.imageBlob);
    source = objectUrl;
  }

  try {
    const image = await loadImageElement(source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      throw new Error("图片尺寸无效");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    return await canvasToBlob(canvas);
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

async function copySelectedImage() {
  const selected = getSelectedItem();
  if (!selected?.image) {
    window.alert("当前没有可复制的图片。");
    return;
  }
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    window.alert("当前浏览器不支持复制图片到剪贴板。");
    return;
  }

  try {
    const pngBlob = await createClipboardImageBlob(selected);
    await navigator.clipboard.write([new ClipboardItem({ [pngBlob.type]: pngBlob })]);
    setImportStatus("已复制图片。");
  } catch (error) {
    console.error(error);
    window.alert("复制图片失败：如果是远程图片，可能需要允许跨域访问。");
  }
}

function editSelected() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }
  closeViewer();
  openEditor(selected);
}

async function duplicateSelected() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }

  const duplicatedBlob = selected.imageBlob
    ? new File([selected.imageBlob], selected.filename || `${selected.title}.png`, { type: selected.imageBlob.type || "image/png" })
    : null;
  const copy = normalizeItem({
    ...selected,
    id: crypto.randomUUID(),
    title: `${selected.title} Copy`,
    favorite: false,
    createdAt: new Date().toISOString(),
    imageBlob: duplicatedBlob,
    image: duplicatedBlob ? "" : selected.image,
  });
  if (duplicatedBlob) {
    copy.image = createObjectUrl(copy.id, duplicatedBlob);
  }
  state.items.unshift(copy);
  state.selectedId = copy.id;
  await saveItem(copy);
  render();
}

async function deleteSelected() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }
  const confirmed = window.confirm(`确定删除 "${selected.title}" 吗？`);
  if (!confirmed) {
    return;
  }

  revokeObjectUrl(selected.id);
  state.items = state.items.filter((item) => item.id !== selected.id);
  state.selectedId = state.items[0]?.id ?? null;
  await deleteItemFromDb(selected.id);
  if (!state.selectedId) {
    closeViewer();
  }
  render();
}

async function exportJson() {
  const payload = state.items.map((item) => ({
    id: item.id,
    title: item.title,
    prompt: item.prompt,
    negativePrompt: item.negativePrompt,
    model: item.model,
    size: item.size,
    tags: item.tags,
    notes: item.notes,
    favorite: item.favorite,
    createdAt: item.createdAt,
    sourceType: item.sourceType,
    filename: item.filename,
    sampler: item.sampler,
    scheduler: item.scheduler,
    steps: item.steps,
    cfg: item.cfg,
    seed: item.seed,
    metadataRaw: item.metadataRaw,
    workflowRaw: item.workflowRaw,
  }));

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `prompt-manager-metadata-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setImportStatus("已导出元数据 JSON。");
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  file.text().then(async (text) => {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON must be an array");
      }
      const importedItems = parsed.map((item) => normalizeItem(item));
      state.items = [...importedItems, ...state.items];
      state.selectedId = importedItems[0]?.id ?? state.selectedId;
      await saveItems(importedItems);
      render();
      setImportStatus("JSON 元数据导入成功。");
    } catch (error) {
      console.error(error);
      window.alert("导入失败：请选择正确的 JSON 数组文件。");
    } finally {
      elements.importInput.value = "";
    }
  });
}

async function clearGallery() {
  const confirmed = window.confirm("这会清空当前本地图库数据，是否继续？");
  if (!confirmed) {
    return;
  }

  state.items.forEach((item) => revokeObjectUrl(item.id));
  state.items = [];
  state.selectedId = null;
  state.activeTag = "all";
  state.searchQuery = "";
  state.sourceFilter = "all";
  state.favoriteFilter = "all";
  state.modelFilter = "all";
  state.sortOrder = "newest";
  closeViewer();
  closeEditor();
  elements.searchInput.value = "";
  elements.favoriteFilter.value = "all";
  elements.sortFilter.value = "newest";
  await clearDatabase();
  localStorage.removeItem(STORAGE_KEY);
  setImportStatus("图库已清空。");
  render();
}

function bindEvents() {
  setOpenViewerHandler(openViewer);
  setDetailCopyHandler((copyType, label) => {
    void copyTextToClipboard(getDetailCopyText(copyType), label);
  });
  if (typeof initViewerZoom === "function") {
    initViewerZoom();
  }

  elements.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    render();
  });

  elements.clearFiltersButton.addEventListener("click", () => {
    state.activeTag = "all";
    state.searchQuery = "";
    state.sourceFilter = "all";
    state.favoriteFilter = "all";
    state.modelFilter = "all";
    state.sortOrder = "newest";
    elements.searchInput.value = "";
    elements.favoriteFilter.value = "all";
    elements.sortFilter.value = "newest";
    render();
  });

  elements.sourceFilter.addEventListener("change", (event) => {
    state.sourceFilter = event.target.value;
    render();
  });

  elements.modelFilter.addEventListener("change", (event) => {
    state.modelFilter = event.target.value;
    render();
  });

  elements.favoriteFilter.addEventListener("change", (event) => {
    state.favoriteFilter = event.target.value;
    render();
  });

  elements.sortFilter.addEventListener("change", (event) => {
    state.sortOrder = event.target.value;
    render();
  });

  elements.favoriteToggleButton.addEventListener("click", () => {
    void toggleFavorite();
  });
  elements.copyImageButton.addEventListener("click", () => {
    void copySelectedImage();
  });
  elements.editSelectedButton.addEventListener("click", editSelected);
  elements.duplicateButton.addEventListener("click", () => {
    void duplicateSelected();
  });
  elements.deleteButton.addEventListener("click", () => {
    void deleteSelected();
  });
  elements.newEntryButton.addEventListener("click", () => openEditor(null));
  elements.cancelEditButton.addEventListener("click", closeEditor);
  elements.clearFormButton.addEventListener("click", () => populateForm(null));
  elements.entryForm.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });
  elements.imageUploadInput.addEventListener("change", (event) => {
    void handleEditorImageUpload(event);
  });
  elements.imageUrlInput.addEventListener("input", (event) => {
    const value = event.target.value.trim();
    if (value) {
      resetDraftState();
      state.draftMetadata = normalizeItem({
        title: elements.titleInput.value || "Remote Image",
        image: value,
        prompt: elements.promptInput.value,
        negativePrompt: elements.negativePromptInput.value,
        model: elements.modelInput.value || "Unknown",
        size: elements.sizeInput.value,
        tags: elements.tagsInput.value,
        notes: elements.notesInput.value,
        sourceType: "Remote URL",
      });
      refreshUploadPreview(value);
    } else {
      resetDraftState();
      refreshUploadPreview("");
    }
  });

  elements.bulkImportButton.addEventListener("click", () => elements.bulkImageInput.click());
  elements.bulkImageInput.addEventListener("change", (event) => {
    void handleBulkImageImport(event, { sourceLabel: "图片" });
  });
  elements.folderImportButton.addEventListener("click", () => elements.folderImageInput.click());
  elements.folderImageInput.addEventListener("change", (event) => {
    void handleBulkImageImport(event, { sourceLabel: "图库" });
  });
  elements.exportButton.addEventListener("click", () => {
    void exportJson();
  });
  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", importJson);
  elements.resetDemoButton.addEventListener("click", () => {
    void clearGallery();
  });
  elements.closeViewerButton.addEventListener("click", closeViewer);
  elements.viewerBackdrop.addEventListener("click", closeViewer);
  elements.editorPanel.addEventListener("click", (event) => {
    if (event.target === elements.editorPanel) {
      closeEditor();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.viewerOpen) {
        closeViewer();
      }
      if (state.editorOpen) {
        closeEditor();
      }
    }
  });
  window.addEventListener("resize", queueScrollbarMaskSync);
  window.addEventListener("beforeunload", () => {
    revokeAllObjectUrls();
    if (state.draftObjectUrl) {
      URL.revokeObjectURL(state.draftObjectUrl);
    }
  });
}

async function initializeApp() {
  bindEvents();
  try {
    await loadState();
    state.isInitialized = true;
    render();
    queueScrollbarMaskSync();
    setImportStatus(`支持批量导入 ComfyUI / SD WebUI 图片。当前并发导入上限 ${IMPORT_CONCURRENCY}。`);
  } catch (error) {
    console.error(error);
    setImportStatus("初始化失败：无法打开本地图库数据库。");
  }
}

const publicApi = {
  createItemFromFile,
  extractMetadataFromImage,
  parseSdParameters,
  parseComfyMetadataFromTextChunks,
  inferTags,
  IMPORT_CONCURRENCY,
};

window.promptManagerApp = publicApi;


