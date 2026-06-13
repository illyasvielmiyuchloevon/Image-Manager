let dbPromise = null;

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(ROOT_STORE_NAME)) {
        db.createObjectStore(ROOT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

function toDbRecord(item) {
  return {
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
    imageBlob: item.imageBlob || null,
    thumbnailBlob: item.thumbnailBlob || null,
    thumbnailMaxEdge: item.thumbnailBlob ? normalizeThumbnailMaxEdge(item.thumbnailMaxEdge) || THUMBNAIL_MAX_EDGE : 0,
  };
}

function fromDbRecord(record) {
  const imageBlob = record?.imageBlob instanceof Blob ? record.imageBlob : null;
  const storedThumbnailBlob = record?.thumbnailBlob instanceof Blob ? record.thumbnailBlob : null;
  const thumbnailMaxEdge = normalizeThumbnailMaxEdge(record?.thumbnailMaxEdge);
  const thumbnailBlob = storedThumbnailBlob && thumbnailMaxEdge === THUMBNAIL_MAX_EDGE ? storedThumbnailBlob : null;
  return normalizeItem({
    ...record,
    image: imageBlob ? createObjectUrl(record.id, imageBlob) : "",
    thumbnailImage: thumbnailBlob ? createThumbnailObjectUrl(record.id, thumbnailBlob) : "",
    imageBlob,
    thumbnailBlob,
    thumbnailMaxEdge: thumbnailBlob ? thumbnailMaxEdge : 0,
  });
}

function normalizeLibraryRoot(root) {
  const source = root && typeof root === "object" ? root : {};
  return {
    id: String(source.id || "").trim(),
    name: String(source.name || "Library").trim(),
    kind: String(source.kind || "directory").trim(),
    handle: source.handle || null,
    lastScannedAt: String(source.lastScannedAt || "").trim(),
    status: String(source.status || "").trim(),
    createdAt: String(source.createdAt || new Date().toISOString()).trim(),
  };
}

function normalizeLegacyDbRecord(record) {
  if (!record || record.rootId) {
    return record;
  }

  if (record.imageBlob instanceof Blob) {
    return {
      ...record,
      rootId: LEGACY_ROOT_ID,
      rootName: "Legacy Imports",
      relativePath: normalizePathText(record.filename || record.id),
      folderPath: "",
      storageMode: "legacy",
      fileSize: record.imageBlob.size || 0,
      fileLastModified: Date.parse(record.createdAt || "") || 0,
    };
  }

  return {
    ...record,
    storageMode: record.image ? "remote" : "indexed",
  };
}

async function normalizeDbRecordIdentity(record) {
  const normalizedRecord = normalizeLegacyDbRecord(record);
  if (!normalizedRecord || !(normalizedRecord.imageBlob instanceof Blob)) {
    return normalizedRecord;
  }

  if (normalizedRecord.storageMode !== "legacy" && normalizedRecord.storageMode !== "blob") {
    return normalizedRecord;
  }

  if (normalizedRecord.fileHash || typeof getFileHash !== "function") {
    return normalizedRecord;
  }

  const fileHash = await getFileHash(normalizedRecord.imageBlob);
  if (!fileHash) {
    return normalizedRecord;
  }
  return {
    ...normalizedRecord,
    id: normalizedRecord.id || `file-${fileHash}`,
    fileHash,
  };
}

async function refreshUnknownDbRecordMetadata(record) {
  if (
    !record ||
    record.sourceType !== "Unknown" ||
    !(record.imageBlob instanceof Blob) ||
    typeof extractMetadataFromFile !== "function" ||
    typeof File === "undefined"
  ) {
    return record;
  }

  const file = new File([record.imageBlob], record.filename || "image.png", {
    type: record.imageBlob.type || "image/png",
    lastModified: Date.parse(record.createdAt || "") || Date.now(),
  });
  const metadata = await extractMetadataFromFile(file);
  if (!metadata || metadata.sourceType === "Unknown") {
    return record;
  }

  return {
    ...record,
    prompt: metadata.prompt,
    negativePrompt: metadata.negativePrompt,
    model: metadata.model,
    size: metadata.size || record.size,
    tags: metadata.tags,
    notes: `已从 ${metadata.sourceType} 图片自动提取元数据。`,
    sourceType: metadata.sourceType,
    sampler: metadata.sampler,
    scheduler: metadata.scheduler,
    steps: metadata.steps,
    cfg: metadata.cfg,
    seed: metadata.seed,
    metadataRaw: metadata.metadataRaw,
    workflowRaw: metadata.workflowRaw,
    fileHash: metadata.fileHash || record.fileHash,
  };
}

function mergeDbRecordsById(records) {
  const merged = new Map();
  records.filter(Boolean).forEach((record) => {
    const previous = merged.get(record.id);
    if (!previous) {
      merged.set(record.id, record);
      return;
    }
    merged.set(record.id, {
      ...previous,
      ...record,
      favorite: previous.favorite === true || record.favorite === true,
      createdAt: previous.createdAt || record.createdAt,
      notes: record.notes || previous.notes,
    });
  });
  return [...merged.values()];
}

async function getAllLibraryRootsFromDb(db) {
  if (!db.objectStoreNames.contains(ROOT_STORE_NAME)) {
    return [];
  }
  const transaction = db.transaction(ROOT_STORE_NAME, "readonly");
  const store = transaction.objectStore(ROOT_STORE_NAME);
  const roots = await requestToPromise(store.getAll());
  await transactionDone(transaction);
  return Array.isArray(roots) ? roots.map(normalizeLibraryRoot).filter((root) => root.id) : [];
}

async function saveLibraryRoot(root) {
  const normalizedRoot = normalizeLibraryRoot(root);
  if (!normalizedRoot.id) {
    return;
  }
  const db = await openDatabase();
  const transaction = db.transaction(ROOT_STORE_NAME, "readwrite");
  transaction.objectStore(ROOT_STORE_NAME).put(normalizedRoot);
  await transactionDone(transaction);
}

async function saveLibraryRoots(roots) {
  const db = await openDatabase();
  const transaction = db.transaction(ROOT_STORE_NAME, "readwrite");
  const store = transaction.objectStore(ROOT_STORE_NAME);
  roots.map(normalizeLibraryRoot).filter((root) => root.id).forEach((root) => store.put(root));
  await transactionDone(transaction);
}

async function deleteLibraryRoot(id) {
  const db = await openDatabase();
  const transaction = db.transaction([ROOT_STORE_NAME, STORE_NAME], "readwrite");
  transaction.objectStore(ROOT_STORE_NAME).delete(id);
  const itemStore = transaction.objectStore(STORE_NAME);
  const items = await requestToPromise(itemStore.getAll());
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (item.rootId === id) {
      itemStore.delete(item.id);
    }
  });
  await transactionDone(transaction);
}

async function deleteItemsFromDb(ids) {
  if (!ids.length) {
    return;
  }
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  ids.forEach((id) => store.delete(id));
  await transactionDone(transaction);
}

async function loadState() {
  const db = await openDatabase();
  const roots = await getAllLibraryRootsFromDb(db);
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const records = await requestToPromise(store.getAll());
  await transactionDone(transaction);

  const normalizedRecords = Array.isArray(records) ? records : [];
  const identityRecords = await Promise.all(normalizedRecords.map(normalizeDbRecordIdentity));
  const refreshedRecords = await Promise.all(identityRecords.map(refreshUnknownDbRecordMetadata));
  const dedupedRecords = mergeDbRecordsById(refreshedRecords);
  const hasLegacyItems = dedupedRecords.some((record) => record.rootId === LEGACY_ROOT_ID);
  const allRoots = hasLegacyItems && !roots.some((root) => root.id === LEGACY_ROOT_ID)
    ? [
        ...roots,
        normalizeLibraryRoot({
          id: LEGACY_ROOT_ID,
          name: "Legacy Imports",
          kind: "legacy",
          status: "cached",
        }),
      ]
    : roots;

  state.libraryRoots = allRoots;
  state.items = dedupedRecords.map(fromDbRecord);
  state.selectedId = state.items[0]?.id ?? null;

  if (
    dedupedRecords.length !== normalizedRecords.length ||
    dedupedRecords.some((record, index) => {
      const previous = normalizedRecords[index];
      return record?.id !== previous?.id || record?.sourceType !== previous?.sourceType || record?.rootId !== previous?.rootId;
    })
  ) {
    await clearItemsFromDb();
    await saveItems(state.items);
  }
  if (hasLegacyItems) {
    await saveLibraryRoots(allRoots);
  }
}

async function saveItem(item) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(toDbRecord(item));
  await transactionDone(transaction);
}

async function saveItems(items) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  items.forEach((item) => {
    store.put(toDbRecord(item));
  });
  await transactionDone(transaction);
}

async function deleteItemFromDb(id) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);
  await transactionDone(transaction);
}

async function clearItemsFromDb() {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).clear();
  await transactionDone(transaction);
}

async function clearDatabase() {
  const db = await openDatabase();
  const stores = db.objectStoreNames.contains(ROOT_STORE_NAME) ? [STORE_NAME, ROOT_STORE_NAME] : [STORE_NAME];
  const transaction = db.transaction(stores, "readwrite");
  transaction.objectStore(STORE_NAME).clear();
  if (stores.includes(ROOT_STORE_NAME)) {
    transaction.objectStore(ROOT_STORE_NAME).clear();
  }
  await transactionDone(transaction);
}
