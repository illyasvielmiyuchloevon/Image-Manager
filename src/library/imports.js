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

