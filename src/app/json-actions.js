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
    image: getPersistableImageUrl(item.image),
    filename: item.filename,
    fileHash: item.fileHash,
    rootId: item.rootId,
    rootName: item.rootName,
    relativePath: item.relativePath,
    folderPath: item.folderPath,
    storageMode: item.storageMode,
    fileSize: item.fileSize,
    fileLastModified: item.fileLastModified,
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
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setImportStatus("已导出元数据 JSON。");
}

function normalizeJsonImportItem(item, usedIds) {
  const source = item && typeof item === "object" ? item : {};
  const preferredId = typeof source.id === "string" && source.id.trim() ? source.id.trim() : "";
  const id = preferredId && !usedIds.has(preferredId) ? preferredId : crypto.randomUUID();
  usedIds.add(id);

  return normalizeItem({
    ...source,
    id,
    imageBlob: null,
    thumbnailBlob: null,
    thumbnailImage: "",
    image: typeof source.image === "string" ? source.image : "",
    favorite: source.favorite === true,
  });
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
      const usedIds = new Set(state.items.map((item) => item.id));
      const importedItems = parsed.map((item) => normalizeJsonImportItem(item, usedIds));
      await saveItems(importedItems);
      state.items = [...importedItems, ...state.items];
      state.selectedId = importedItems[0]?.id ?? state.selectedId;
      requestRender();
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

  const previousItems = state.items;
  await clearDatabase();
  previousItems.forEach((item) => revokeItemObjectUrls(item.id));
  state.items = [];
  state.selectedId = null;
  state.activeTag = "all";
  state.searchQuery = "";
  state.sourceFilter = "all";
  state.folderFilter = "all";
  state.favoriteFilter = "all";
  state.modelFilter = "all";
  state.sortOrder = "newest";
  state.libraryRoots = [];
  closeViewer();
  closeEditor();
  elements.searchInput.value = "";
  elements.folderFilter.value = "all";
  elements.favoriteFilter.value = "all";
  elements.sortFilter.value = "newest";
  localStorage.removeItem(STORAGE_KEY);
  setImportStatus("图库已清空。");
  requestRender();
}

