
function setImportStatus(message) {
  elements.importStatus.textContent = message;
}

function resetDraftState() {
  state.draftVersion += 1;
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
  const selected = getSelectedItem();
  if (selected && !selected.image && selected.storageMode === "directory") {
    void ensureItemImageAvailable(selected, { request: true }).then(() => {
      if (state.viewerOpen && state.selectedId === selected.id) {
        renderViewer();
      }
    });
  }
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
  const previous = existingIndex >= 0 ? state.items[existingIndex] : null;
  if (previous) {
    item.favorite = previous.favorite;
  }
  const shouldCreateBlobUrl = item.imageBlob && (!previous || previous.imageBlob !== item.imageBlob || !item.image);
  const shouldCreateThumbnailUrl =
    item.thumbnailBlob && (!previous || previous.thumbnailBlob !== item.thumbnailBlob || !item.thumbnailImage);

  await saveItem(item);

  if (shouldCreateBlobUrl) {
    item.image = createObjectUrl(item.id, item.imageBlob);
  }
  if (shouldCreateThumbnailUrl) {
    item.thumbnailImage = createThumbnailObjectUrl(item.id, item.thumbnailBlob);
  }
  if (previous?.imageBlob && !item.imageBlob) {
    revokeItemObjectUrls(previous.id);
  } else if (previous?.thumbnailBlob && !item.thumbnailBlob) {
    revokeObjectUrl(getThumbnailObjectUrlId(previous.id));
  }

  if (existingIndex >= 0) {
    state.items.splice(existingIndex, 1, item);
  } else {
    state.items.unshift(item);
  }
  state.selectedId = item.id;
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
  const imageBlob = remoteUrl ? null : state.draftBlob || currentItem?.imageBlob || null;
  const thumbnailBlob = remoteUrl ? null : state.draftMetadata?.thumbnailBlob || currentItem?.thumbnailBlob || null;
  const thumbnailMaxEdge = remoteUrl
    ? 0
    : state.draftMetadata?.thumbnailMaxEdge || currentItem?.thumbnailMaxEdge || 0;
  const id = elements.entryId.value || (remoteUrl ? "" : state.draftMetadata?.id) || crypto.randomUUID();
  let image = "";
  let thumbnailImage = "";

  if (imageBlob) {
    image = currentItem?.imageBlob === imageBlob ? currentItem.image : "";
    thumbnailImage = currentItem?.thumbnailBlob === thumbnailBlob ? currentItem.thumbnailImage : "";
  } else if (remoteUrl) {
    image = remoteUrl;
  }

  if (!image && !imageBlob) {
    window.alert("请先上传图片或填写图片 URL。");
    return;
  }

  const prompt = String(formData.get("prompt") || "").trim();
  const payload = normalizeItem({
    id,
    title,
    image,
    imageBlob,
    thumbnailImage,
    thumbnailBlob,
    thumbnailMaxEdge,
    prompt,
    negativePrompt: formData.get("negativePrompt"),
    model: formData.get("model") || state.draftMetadata?.model || currentItem?.model || "Unknown",
    size: formData.get("size") || state.draftMetadata?.size || currentItem?.size || "",
    tags: tags.length ? tags : inferTags(prompt),
    notes: formData.get("notes"),
    favorite: currentItem?.favorite || false,
    createdAt: currentItem?.createdAt || new Date().toISOString(),
    sourceType: remoteUrl ? "Remote URL" : state.draftMetadata?.sourceType || currentItem?.sourceType || "Manual",
    filename: remoteUrl ? "" : state.draftMetadata?.filename || currentItem?.filename || "",
    fileHash: remoteUrl ? "" : state.draftMetadata?.fileHash || currentItem?.fileHash || "",
    rootId: remoteUrl ? "" : state.draftMetadata?.rootId || currentItem?.rootId || "",
    rootName: remoteUrl ? "" : state.draftMetadata?.rootName || currentItem?.rootName || "",
    relativePath: remoteUrl ? "" : state.draftMetadata?.relativePath || currentItem?.relativePath || "",
    folderPath: remoteUrl ? "" : state.draftMetadata?.folderPath || currentItem?.folderPath || "",
    storageMode: remoteUrl ? "remote" : state.draftMetadata?.storageMode || currentItem?.storageMode || "",
    fileSize: remoteUrl ? 0 : state.draftMetadata?.fileSize || currentItem?.fileSize || 0,
    fileLastModified: remoteUrl ? 0 : state.draftMetadata?.fileLastModified || currentItem?.fileLastModified || 0,
    sampler: state.draftMetadata?.sampler || currentItem?.sampler || "",
    scheduler: state.draftMetadata?.scheduler || currentItem?.scheduler || "",
    steps: state.draftMetadata?.steps || currentItem?.steps || "",
    cfg: state.draftMetadata?.cfg || currentItem?.cfg || "",
    seed: state.draftMetadata?.seed || currentItem?.seed || "",
    metadataRaw: state.draftMetadata?.metadataRaw || currentItem?.metadataRaw || "",
    workflowRaw: state.draftMetadata?.workflowRaw || currentItem?.workflowRaw || "",
  });

  await createThumbnailForItem(payload);
  await upsertItem(payload);
  closeEditor();
  setImportStatus(`已保存：${payload.title}`);
  requestRender();
}

async function handleEditorImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const draftVersion = state.draftVersion + 1;
  state.draftVersion = draftVersion;
  setImportStatus(`正在解析 ${file.name} ...`);
  try {
    const item = await createItemFromFile(file);
    if (draftVersion !== state.draftVersion || !state.editorOpen) {
      revokeItemObjectUrls(item.id);
      return;
    }
    revokeItemObjectUrls(item.id);
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

let importFlushTimer = 0;
const pendingImportedItems = [];
const queuedThumbnailIds = new Set();
const thumbnailQueue = [];
let activeThumbnailTasks = 0;

function mergeItemsById(newItems, existingItems = state.items) {
  const mergedById = new Map();
  const orderedItems = [];

  newItems.filter(Boolean).forEach((item) => {
    const previous = mergedById.get(item.id);
    if (previous) {
      const previousIndex = orderedItems.findIndex((entry) => entry.id === item.id);
      if (previousIndex !== -1) {
        orderedItems.splice(previousIndex, 1);
      }
    }
    mergedById.set(item.id, item);
    orderedItems.push(item);
  });

  existingItems.forEach((item) => {
    const replacement = mergedById.get(item.id);
    if (replacement) {
      return;
    }
    mergedById.set(item.id, item);
    orderedItems.push(item);
  });

  return orderedItems;
}

function flushPendingImportedItems() {
  importFlushTimer = 0;
  if (pendingImportedItems.length === 0) {
    return;
  }

  const batch = pendingImportedItems.splice(0, pendingImportedItems.length);
  state.items = mergeItemsById(batch);
  state.selectedId = state.selectedId ?? batch[0]?.id ?? null;
  requestRender();
}

function queueImportedItemForDisplay(item) {
  pendingImportedItems.push(item);
  if (importFlushTimer) {
    return;
  }

  importFlushTimer = window.setTimeout(flushPendingImportedItems, IMPORT_UI_FLUSH_INTERVAL_MS);
}

function processThumbnailQueue() {
  while (activeThumbnailTasks < THUMBNAIL_CONCURRENCY && thumbnailQueue.length > 0) {
    const item = thumbnailQueue.shift();
    activeThumbnailTasks += 1;
    void ensureThumbnailForItem(item)
      .then((updatedItem) => {
        if (updatedItem) {
          updateGalleryThumbnail(updatedItem);
        }
      })
      .catch((error) => {
        console.warn(`Thumbnail generation failed for ${item.filename || item.title}`, error);
      })
      .finally(() => {
        activeThumbnailTasks -= 1;
        queuedThumbnailIds.delete(item.id);
        processThumbnailQueue();
      });
  }
}

function queueThumbnailGeneration(items, options = {}) {
  const queuedItems = [];
  items.forEach((item) => {
    if (!item?.imageBlob || hasCurrentThumbnail(item) || queuedThumbnailIds.has(item.id)) {
      return;
    }
    queuedThumbnailIds.add(item.id);
    queuedItems.push(item);
  });
  if (options.priority) {
    thumbnailQueue.unshift(...queuedItems);
  } else {
    thumbnailQueue.push(...queuedItems);
  }
  processThumbnailQueue();
}

async function createThumbnailForItem(item) {
  if (!item?.imageBlob || hasCurrentThumbnail(item)) {
    return item;
  }

  const thumbnailBlob = await createThumbnailBlob(item.imageBlob);
  if (!thumbnailBlob) {
    return item;
  }

  item.thumbnailBlob = thumbnailBlob;
  item.thumbnailMaxEdge = THUMBNAIL_MAX_EDGE;
  item.thumbnailImage = createThumbnailObjectUrl(item.id, thumbnailBlob);
  return item;
}

function getRootDisplayName(root) {
  return root?.name || "Local Folder";
}

function makeLibraryRootId(prefix = "root") {
  return `${prefix}-${crypto.randomUUID()}`;
}

function upsertLibraryRootInState(root) {
  const normalizedRoot = normalizeLibraryRoot(root);
  const index = state.libraryRoots.findIndex((entry) => entry.id === normalizedRoot.id);
  if (index >= 0) {
    state.libraryRoots.splice(index, 1, normalizedRoot);
  } else {
    state.libraryRoots.push(normalizedRoot);
  }
  return normalizedRoot;
}

function getVirtualRoot(id, name, kind = "virtual") {
  const existing = state.libraryRoots.find((root) => root.id === id);
  if (existing) {
    return existing;
  }
  return upsertLibraryRootInState({
    id,
    name,
    kind,
    status: "cached",
    createdAt: new Date().toISOString(),
  });
}

async function ensureRootPermission(root, options = {}) {
  const handle = root?.handle;
  if (!handle?.queryPermission) {
    return false;
  }

  const descriptor = { mode: "read" };
  const current = await handle.queryPermission(descriptor);
  if (current === "granted") {
    return true;
  }
  if (!options.request || !handle.requestPermission) {
    return false;
  }
  return (await handle.requestPermission(descriptor)) === "granted";
}

async function findExistingRootByHandle(handle) {
  if (!handle?.isSameEntry) {
    return null;
  }

  for (const root of state.libraryRoots) {
    if (root.kind !== "directory" || !root.handle) {
      continue;
    }
    try {
      if (await root.handle.isSameEntry(handle)) {
        return root;
      }
    } catch (error) {
      console.warn("Directory handle comparison failed", error);
    }
  }
  return null;
}

async function getFileFromRoot(root, relativePath) {
  const handle = root?.handle;
  if (!handle) {
    return null;
  }

  const parts = normalizePathText(relativePath).split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  let directory = handle;
  for (let index = 0; index < parts.length - 1; index += 1) {
    directory = await directory.getDirectoryHandle(parts[index]);
  }
  const fileHandle = await directory.getFileHandle(parts[parts.length - 1]);
  return fileHandle.getFile();
}

async function ensureItemImageAvailable(item, options = {}) {
  if (!item || item.image || item.imageBlob) {
    return item?.image || "";
  }
  if (item.storageMode !== "directory" || !item.rootId || !item.relativePath) {
    return item.thumbnailImage || "";
  }

  const root = state.libraryRoots.find((entry) => entry.id === item.rootId);
  if (!root || !(await ensureRootPermission(root, { request: options.request === true }))) {
    return item.thumbnailImage || "";
  }

  try {
    const file = await getFileFromRoot(root, item.relativePath);
    if (!file) {
      return item.thumbnailImage || "";
    }
    item.image = createObjectUrl(item.id, file);
    item.fileSize = file.size || item.fileSize;
    item.fileLastModified = file.lastModified || item.fileLastModified;
    return item.image;
  } catch (error) {
    console.warn(`Failed to load image file for ${item.relativePath}`, error);
    return item.thumbnailImage || "";
  }
}

async function collectDirectoryImageFiles(directoryHandle, prefix = "") {
  const files = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    const relativePath = normalizePathText(`${prefix}/${name}`);
    if (handle.kind === "directory") {
      files.push(...(await collectDirectoryImageFiles(handle, relativePath)));
      continue;
    }
    if (handle.kind !== "file") {
      continue;
    }
    const file = await handle.getFile();
    if (isSupportedImageFile(file)) {
      files.push({ file, relativePath });
    }
  }
  return files;
}

function mergeScannedItemWithPrevious(item, previous) {
  if (!previous) {
    return item;
  }

  return normalizeItem({
    ...item,
    title: previous.title || item.title,
    favorite: previous.favorite === true,
    notes: previous.notes || item.notes,
  });
}

async function createLibraryItemFromFile(file, options) {
  const item = await createItemFromFile(file, options);
  const thumbnailBlob = await createThumbnailBlob(file);
  if (thumbnailBlob) {
    item.thumbnailBlob = thumbnailBlob;
    item.thumbnailMaxEdge = THUMBNAIL_MAX_EDGE;
    item.thumbnailImage = createThumbnailObjectUrl(item.id, thumbnailBlob);
  }
  return item;
}

async function scanLibraryRoot(root, options = {}) {
  if (!root || root.kind !== "directory" || !root.handle) {
    return { imported: 0, removed: 0, skipped: 0 };
  }

  const granted = await ensureRootPermission(root, { request: options.requestPermission === true });
  if (!granted) {
    const updatedRoot = upsertLibraryRootInState({
      ...root,
      status: "需要重新授权",
    });
    await saveLibraryRoot(updatedRoot);
    requestRender();
    return { imported: 0, removed: 0, skipped: 0, permissionDenied: true };
  }

  const startedAt = performance.now();
  const rootName = getRootDisplayName(root);
  setImportStatus(`正在扫描 ${rootName} ...`);
  const files = await collectDirectoryImageFiles(root.handle);
  const existingById = new Map(state.items.map((item) => [item.id, item]));
  const scannedItems = [];
  const seenIds = new Set();
  let failedCount = 0;

  document.body.classList.add("is-importing-gallery");
  try {
    await mapConcurrent(
      files,
      Math.min(IMPORT_CONCURRENCY, 32),
      async ({ file, relativePath }, index) => {
        const folderPath = folderPathFromRelativePath(relativePath);
        const itemId = buildPathItemId(root.id, relativePath);
        const previous = existingById.get(itemId);
        seenIds.add(itemId);

        if (
          previous &&
          previous.fileSize === file.size &&
          previous.fileLastModified === file.lastModified &&
          hasCurrentThumbnail(previous)
        ) {
          if (!previous.image) {
            previous.image = createObjectUrl(previous.id, file);
          }
          scannedItems[index] = previous;
          return previous;
        }

        try {
          const item = await createLibraryItemFromFile(file, {
            rootId: root.id,
            rootName,
            relativePath,
            folderPath,
            storageMode: "directory",
            persistBlob: false,
          });
          const mergedItem = mergeScannedItemWithPrevious(item, previous);
          scannedItems[index] = mergedItem;
          queueImportedItemForDisplay(mergedItem);
          return mergedItem;
        } catch (error) {
          failedCount += 1;
          console.warn(`Scan failed for ${relativePath}`, error);
          return null;
        }
      },
      (done, total) => {
        if (done === total || done % 25 === 0) {
          setImportStatus(`正在扫描 ${rootName}：${done}/${total}`);
        }
      }
    );

    flushPendingImportedItems();
    const successfulItems = scannedItems.filter(Boolean);
    const staleIds = state.items
      .filter((item) => item.rootId === root.id && !seenIds.has(item.id))
      .map((item) => item.id);

    await saveItems(successfulItems);
    await deleteItemsFromDb(staleIds);
    staleIds.forEach(revokeItemObjectUrls);
    state.items = mergeItemsById(
      successfulItems,
      state.items.filter((item) => item.rootId !== root.id || seenIds.has(item.id))
    );
    if (!state.selectedId || !state.items.some((item) => item.id === state.selectedId)) {
      state.selectedId = state.items[0]?.id ?? null;
    }

    const updatedRoot = upsertLibraryRootInState({
      ...root,
      name: rootName,
      status: failedCount ? `已同步，${failedCount} 个失败` : "已同步",
      lastScannedAt: new Date().toISOString(),
    });
    await saveLibraryRoot(updatedRoot);

    const seconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
    setImportStatus(`已同步 ${rootName}：${successfulItems.length} 张，删除 ${staleIds.length} 个失效条目，用时 ${seconds.toFixed(2)}s。`);
    requestRender();
    return { imported: successfulItems.length, removed: staleIds.length, skipped: failedCount };
  } finally {
    flushPendingImportedItems();
    document.body.classList.remove("is-importing-gallery");
  }
}

async function addDirectoryHandleRoot(directoryHandle, options = {}) {
  const existingRoot = await findExistingRootByHandle(directoryHandle);
  const root = existingRoot || upsertLibraryRootInState({
    id: makeLibraryRootId("root"),
    name: directoryHandle.name || "Local Folder",
    kind: "directory",
    handle: directoryHandle,
    status: "待同步",
    createdAt: new Date().toISOString(),
  });

  await saveLibraryRoot(root);
  requestRender();
  return scanLibraryRoot(root, { requestPermission: options.requestPermission !== false });
}

async function addLocalDirectoryRoot() {
  if (!window.showDirectoryPicker) {
    setImportStatus("当前浏览器不支持持久目录授权，已切换为一次性文件夹快照导入。");
    elements.folderImageInput.click();
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "read" });
    await addDirectoryHandleRoot(directoryHandle, { requestPermission: true });
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      setImportStatus("添加本地文件夹失败。");
    }
  }
}

async function handleFolderSnapshotImport(event) {
  const files = Array.from(event.target.files || []).filter(isSupportedImageFile);
  if (files.length === 0) {
    setImportStatus("没有可导入的图库文件。");
    event.target.value = "";
    return;
  }

  const rootName = normalizePathText(files[0].webkitRelativePath).split("/")[0] || "Folder Snapshot";
  const root = upsertLibraryRootInState({
    id: makeLibraryRootId("snapshot"),
    name: rootName,
    kind: "snapshot",
    status: "cached",
    createdAt: new Date().toISOString(),
  });
  await saveLibraryRoot(root);

  const wrappedEvent = {
    target: {
      files,
      value: "",
    },
  };
  await handleBulkImageImport(wrappedEvent, {
    sourceLabel: "图库",
    rootId: root.id,
    rootName: root.name,
    storageMode: "blob",
    persistBlob: true,
    useRelativePath: true,
    replaceRoot: true,
  });
  event.target.value = "";
}

async function syncAuthorizedLibraryRoots(options = {}) {
  const roots = state.libraryRoots.filter((root) => root.kind === "directory");
  if (roots.length === 0) {
    if (!options.silentIfNone) {
      setImportStatus("还没有添加本地文件夹。");
    }
    return;
  }

  let syncedCount = 0;
  let permissionCount = 0;
  for (const root of roots) {
    const result = await scanLibraryRoot(root, { requestPermission: options.requestPermission === true });
    if (result.permissionDenied) {
      permissionCount += 1;
    } else {
      syncedCount += 1;
    }
  }
  if (permissionCount > 0) {
    setImportStatus(`已同步 ${syncedCount} 个文件夹，${permissionCount} 个文件夹需要重新授权。`);
  }
}

async function importDroppedFiles(files, options = {}) {
  const imageFiles = files.filter(isSupportedImageFile);
  const skippedCount = files.length - imageFiles.length;
  if (imageFiles.length === 0) {
    setImportStatus(skippedCount > 0 ? `已跳过 ${skippedCount} 个非图片文件。` : "没有可导入的图片。");
    return;
  }

  const root = getVirtualRoot(DROPPED_ROOT_ID, "Dropped Files", "virtual");
  await saveLibraryRoot(root);
  await handleBulkImageImport(
    {
      target: {
        files: imageFiles,
        value: "",
      },
    },
    {
      sourceLabel: "拖放图片",
      rootId: root.id,
      rootName: root.name,
      storageMode: "blob",
      persistBlob: true,
      useRelativePath: options.useRelativePath === true,
    }
  );
  if (skippedCount > 0) {
    setImportStatus(`${elements.importStatus.textContent} 已跳过 ${skippedCount} 个非图片文件。`);
  }
}

async function getDroppedHandles(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  if (!items.length) {
    return [];
  }

  const handlePromises = items
    .filter((item) => item.kind === "file" && typeof item.getAsFileSystemHandle === "function")
    .map((item) => item.getAsFileSystemHandle().catch(() => null));
  const handles = await Promise.all(handlePromises);
  return handles.filter(Boolean);
}

async function handleDropImport(dataTransfer) {
  const handles = await getDroppedHandles(dataTransfer);
  const files = [];
  let directoryCount = 0;

  if (handles.length > 0) {
    for (const handle of handles) {
      if (handle.kind === "directory") {
        directoryCount += 1;
        await addDirectoryHandleRoot(handle, { requestPermission: true });
      } else if (handle.kind === "file") {
        const file = await handle.getFile();
        files.push(file);
      }
    }
  } else {
    files.push(...Array.from(dataTransfer?.files || []));
  }

  if (files.length > 0) {
    await importDroppedFiles(files);
  } else if (directoryCount === 0) {
    setImportStatus("没有可导入的图片或文件夹。");
  }
}

let dragDepth = 0;

function setDropOverlayVisible(visible) {
  state.isDraggingFiles = visible;
  if (elements.dropOverlay) {
    elements.dropOverlay.hidden = !visible;
  }
  document.body.classList.toggle("is-dragging-files", visible);
}

function eventHasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

async function handleBulkImageImport(event, options = {}) {
  const sourceLabel = options.sourceLabel || "图片";
  const files = Array.from(event.target.files || []).filter(isSupportedImageFile);
  if (files.length === 0) {
    setImportStatus(`没有可导入的${sourceLabel}文件。`);
    return;
  }

  const startedAt = performance.now();
  document.body.classList.add("is-importing-gallery");
  setImportStatus(`正在读取 ${files.length} 个${sourceLabel}文件，图库会先显示，缩略图随后后台生成...`);
  let importedItems = [];
  let failedCount = 0;

  try {
    await mapConcurrent(
      files,
      IMPORT_CONCURRENCY,
      async (file, fileIndex) => {
        try {
          const relativePath = options.useRelativePath ? normalizePathText(file.webkitRelativePath || file.name) : file.name;
          const item = await createItemFromFile(file, {
            rootId: options.rootId || "",
            rootName: options.rootName || "",
            relativePath,
            folderPath: folderPathFromRelativePath(relativePath),
            storageMode: options.storageMode || "blob",
            persistBlob: options.persistBlob !== false,
          });
          importedItems[fileIndex] = item;
          queueImportedItemForDisplay(item);
          return { item };
        } catch (error) {
          failedCount += 1;
          console.warn(`Import failed for ${file.name}`, error);
          return { error, file };
        }
      },
      (done, total) => {
        if (done === total || done % 25 === 0) {
          setImportStatus(`正在读取 ${done}/${total} 个${sourceLabel}文件，已读取的项目会先进入图库...`);
        }
      }
    );
    flushPendingImportedItems();
    const successfulItems = importedItems.filter(Boolean);

    if (successfulItems.length === 0) {
      setImportStatus(`导入失败：${files.length} 个${sourceLabel}文件都无法解析。`);
      window.alert("没有成功导入的图片，请检查文件是否完整。");
      return;
    }

    state.items = mergeItemsById(successfulItems);
    if (options.rootId && options.replaceRoot === true) {
      const importedIds = new Set(successfulItems.map((item) => item.id));
      const staleIds = state.items
        .filter((item) => item.rootId === options.rootId && !importedIds.has(item.id))
        .map((item) => item.id);
      await deleteItemsFromDb(staleIds);
      staleIds.forEach(revokeItemObjectUrls);
      state.items = state.items.filter((item) => item.rootId !== options.rootId || importedIds.has(item.id));
      state.items = mergeItemsById(successfulItems, state.items);
    }
    requestRender();

    const displayElapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
    const displayRate = (successfulItems.length / displayElapsedSeconds).toFixed(1);
    const failedText = failedCount > 0 ? `，${failedCount} 个失败` : "";
    setImportStatus(
      `已显示 ${successfulItems.length} 个${sourceLabel}文件${failedText}，用时 ${displayElapsedSeconds.toFixed(2)}s，约 ${displayRate} 张/秒。正在保存本地图库...`
    );
    await saveItems(successfulItems);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => queueThumbnailGeneration(successfulItems, { priority: true }), 0);
    });
    setImportStatus(
      `已导入 ${successfulItems.length} 个${sourceLabel}文件${failedText}，缩略图后台生成中：${THUMBNAIL_CONCURRENCY} 并发，最大 512x512。`
    );
  } catch (error) {
    console.error(error);
    setImportStatus("批量导入失败。");
    window.alert("批量导入失败，请重试。");
  } finally {
    flushPendingImportedItems();
    document.body.classList.remove("is-importing-gallery");
    event.target.value = "";
  }
}

async function toggleFavorite() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }
  const updated = normalizeItem({ ...selected, favorite: !selected.favorite });
  await saveItem(updated);
  Object.assign(selected, updated);
  requestRender();
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
  if (selected && !selected.image) {
    await ensureItemImageAvailable(selected, { request: true });
  }
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
  const duplicatedThumbnailBlob = duplicatedBlob ? selected.thumbnailBlob || null : null;
  const copy = normalizeItem({
    ...selected,
    id: crypto.randomUUID(),
    title: `${selected.title} Copy`,
    favorite: false,
    createdAt: new Date().toISOString(),
    imageBlob: duplicatedBlob,
    thumbnailBlob: duplicatedThumbnailBlob,
    image: duplicatedBlob ? "" : selected.image,
    thumbnailImage: duplicatedThumbnailBlob ? "" : selected.thumbnailImage,
  });
  if (duplicatedBlob) {
    copy.image = "";
  }
  await saveItem(copy);
  if (duplicatedBlob) {
    copy.image = createObjectUrl(copy.id, duplicatedBlob);
  }
  if (duplicatedThumbnailBlob) {
    copy.thumbnailImage = createThumbnailObjectUrl(copy.id, duplicatedThumbnailBlob);
  }
  state.items.unshift(copy);
  state.selectedId = copy.id;
  requestRender();
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

  await deleteItemFromDb(selected.id);
  revokeItemObjectUrls(selected.id);
  state.items = state.items.filter((item) => item.id !== selected.id);
  state.selectedId = state.items[0]?.id ?? null;
  if (!state.selectedId) {
    closeViewer();
  }
  requestRender();
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

let thumbnailBackfillRunning = false;

async function ensureThumbnailForItem(item) {
  if (!item?.imageBlob || hasCurrentThumbnail(item)) {
    return null;
  }

  const thumbnailBlob = await createThumbnailBlob(item.imageBlob);
  if (!thumbnailBlob) {
    return null;
  }

  const currentItem = state.items.find((entry) => entry.id === item.id) || null;
  if (!currentItem || hasCurrentThumbnail(currentItem) || currentItem.imageBlob !== item.imageBlob) {
    return null;
  }

  const updated = normalizeItem({
    ...currentItem,
    thumbnailBlob,
    thumbnailMaxEdge: THUMBNAIL_MAX_EDGE,
    thumbnailImage: "",
  });
  await saveItem(updated);
  Object.assign(currentItem, updated);
  currentItem.thumbnailImage = createThumbnailObjectUrl(currentItem.id, thumbnailBlob);
  return currentItem;
}

async function backfillMissingThumbnails() {
  if (thumbnailBackfillRunning) {
    return;
  }

  const missingItems = state.items.filter((item) => item.imageBlob && !hasCurrentThumbnail(item));
  if (missingItems.length === 0) {
    return;
  }

  thumbnailBackfillRunning = true;
  try {
    queueThumbnailGeneration(missingItems);
  } finally {
    thumbnailBackfillRunning = false;
  }
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
    requestRender();
  });

  elements.clearFiltersButton.addEventListener("click", () => {
    state.activeTag = "all";
    state.searchQuery = "";
    state.sourceFilter = "all";
    state.folderFilter = "all";
    state.favoriteFilter = "all";
    state.modelFilter = "all";
    state.sortOrder = "newest";
    elements.searchInput.value = "";
    elements.folderFilter.value = "all";
    elements.favoriteFilter.value = "all";
    elements.sortFilter.value = "newest";
    requestRender();
  });

  elements.sourceFilter.addEventListener("change", (event) => {
    state.sourceFilter = event.target.value;
    requestRender();
  });

  elements.folderFilter.addEventListener("change", (event) => {
    state.folderFilter = event.target.value;
    requestRender();
  });

  elements.modelFilter.addEventListener("change", (event) => {
    state.modelFilter = event.target.value;
    requestRender();
  });

  elements.favoriteFilter.addEventListener("change", (event) => {
    state.favoriteFilter = event.target.value;
    requestRender();
  });

  elements.sortFilter.addEventListener("change", (event) => {
    state.sortOrder = event.target.value;
    requestRender();
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
  elements.folderImportButton.addEventListener("click", (event) => {
    event.preventDefault();
    void addLocalDirectoryRoot();
  });
  elements.folderImageInput.addEventListener("change", (event) => {
    void handleFolderSnapshotImport(event);
  });
  elements.syncLibraryButton.addEventListener("click", () => {
    void syncAuthorizedLibraryRoots({ requestPermission: true });
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
  window.addEventListener("dragenter", (event) => {
    if (!eventHasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepth += 1;
    setDropOverlayVisible(true);
  });
  window.addEventListener("dragover", (event) => {
    if (!eventHasFiles(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropOverlayVisible(true);
  });
  window.addEventListener("dragleave", (event) => {
    if (!eventHasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepth = Math.max(dragDepth - 1, 0);
    if (dragDepth === 0) {
      setDropOverlayVisible(false);
    }
  });
  window.addEventListener("drop", (event) => {
    if (!eventHasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepth = 0;
    setDropOverlayVisible(false);
    void handleDropImport(event.dataTransfer);
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
    setImportStatus(
      `支持批量导入 ComfyUI / SD WebUI / NovelAI / OpenAI 图片。导入并发 ${IMPORT_CONCURRENCY}，缩略图并发 ${THUMBNAIL_CONCURRENCY}，缩略图最大 512x512。`
    );
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        void backfillMissingThumbnails();
        void syncAuthorizedLibraryRoots({ requestPermission: false, silentIfNone: true });
      }, 500);
    });
  } catch (error) {
    console.error(error);
    setImportStatus("初始化失败：无法打开本地图库数据库。");
  }
}

const publicApi = {
  createItemFromFile,
  extractMetadataFromFile,
  extractMetadataFromImage,
  createThumbnailBlob,
  parseSdParameters,
  parseComfyMetadataFromTextChunks,
  parseNovelAiMetadataFromTextChunks,
  parseOpenAiMetadataFromTextChunks,
  parseOpenAiMetadataFromBytes,
  parseOpenAiMetadataFromBinaryChunks,
  inferTags,
  IMPORT_CONCURRENCY,
  THUMBNAIL_CONCURRENCY,
  THUMBNAIL_MAX_EDGE,
};

window.promptManagerApp = publicApi;


