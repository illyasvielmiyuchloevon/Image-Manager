// BEGIN constants.js
const DB_NAME = "prompt-manager-db";
const DB_VERSION = 1;
const STORE_NAME = "gallery_items";
const STORAGE_KEY = "prompt-manager.gallery.v4";
const METADATA_SLICE_BYTES = 1024 * 1024;
const IMPORT_CONCURRENCY = Math.min(64, Math.max(8, (navigator.hardwareConcurrency || 8) * 2));
const SCROLL_MASK_SELECTORS = [];
// END constants.js

// BEGIN elements.js
const elements = {
  assetCount: document.getElementById("assetCount"),
  favoriteCount: document.getElementById("favoriteCount"),
  modelCount: document.getElementById("modelCount"),
  searchInput: document.getElementById("searchInput"),
  tagFilters: document.getElementById("tagFilters"),
  clearFiltersButton: document.getElementById("clearFiltersButton"),
  sourceFilter: document.getElementById("sourceFilter"),
  modelFilter: document.getElementById("modelFilter"),
  favoriteFilter: document.getElementById("favoriteFilter"),
  sortFilter: document.getElementById("sortFilter"),
  resultSummary: document.getElementById("resultSummary"),
  galleryGrid: document.getElementById("galleryGrid"),
  emptyState: document.getElementById("emptyState"),
  viewerModal: document.getElementById("viewerModal"),
  viewerBackdrop: document.getElementById("viewerBackdrop"),
  closeViewerButton: document.getElementById("closeViewerButton"),
  copyImageButton: document.getElementById("copyImageButton"),
  previewImage: document.getElementById("previewImage"),
  detailPanel: document.getElementById("detailPanel"),
  favoriteToggleButton: document.getElementById("favoriteToggleButton"),
  editSelectedButton: document.getElementById("editSelectedButton"),
  duplicateButton: document.getElementById("duplicateButton"),
  deleteButton: document.getElementById("deleteButton"),
  editorPanel: document.getElementById("editorPanel"),
  newEntryButton: document.getElementById("newEntryButton"),
  cancelEditButton: document.getElementById("cancelEditButton"),
  formHeading: document.getElementById("formHeading"),
  entryForm: document.getElementById("entryForm"),
  entryId: document.getElementById("entryId"),
  titleInput: document.getElementById("titleInput"),
  imageUrlInput: document.getElementById("imageUrlInput"),
  imageUploadInput: document.getElementById("imageUploadInput"),
  uploadPreview: document.getElementById("uploadPreview"),
  promptInput: document.getElementById("promptInput"),
  negativePromptInput: document.getElementById("negativePromptInput"),
  modelInput: document.getElementById("modelInput"),
  sizeInput: document.getElementById("sizeInput"),
  tagsInput: document.getElementById("tagsInput"),
  notesInput: document.getElementById("notesInput"),
  clearFormButton: document.getElementById("clearFormButton"),
  bulkImportButton: document.getElementById("bulkImportButton"),
  bulkImageInput: document.getElementById("bulkImageInput"),
  folderImportButton: document.getElementById("folderImportButton"),
  folderImageInput: document.getElementById("folderImageInput"),
  exportButton: document.getElementById("exportButton"),
  importButton: document.getElementById("importButton"),
  importInput: document.getElementById("importInput"),
  importStatus: document.getElementById("importStatus"),
  resetDemoButton: document.getElementById("resetDemoButton"),
  galleryItemTemplate: document.getElementById("galleryItemTemplate"),
};
// END elements.js

// BEGIN appState.js
const state = {
  items: [],
  selectedId: null,
  activeTag: "all",
  searchQuery: "",
  sourceFilter: "all",
  favoriteFilter: "all",
  modelFilter: "all",
  sortOrder: "newest",
  editorOpen: false,
  viewerOpen: false,
  draftObjectUrl: "",
  draftBlob: null,
  draftMetadata: null,
  isInitialized: false,
};
// END appState.js

// BEGIN objectUrls.js
const objectUrlMap = new Map();

function revokeObjectUrl(id) {
  const existing = objectUrlMap.get(id);
  if (existing) {
    URL.revokeObjectURL(existing);
    objectUrlMap.delete(id);
  }
}

function createObjectUrl(id, blob) {
  revokeObjectUrl(id);
  const objectUrl = URL.createObjectURL(blob);
  objectUrlMap.set(id, objectUrl);
  return objectUrl;
}

function revokeAllObjectUrls() {
  objectUrlMap.forEach((url) => URL.revokeObjectURL(url));
  objectUrlMap.clear();
}
// END objectUrls.js

// BEGIN scrollbarMasks.js
let scrollbarMaskFrame = 0;

function createScrollbarMask(position) {
  const mask = document.createElement("span");
  mask.className = `scrollbar-arrow-mask ${position}`;
  mask.setAttribute("aria-hidden", "true");
  return mask;
}

function syncScrollbarMask(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const scrollbarWidth = Math.max(container.offsetWidth - container.clientWidth, 0);
  const hasVerticalScrollbar = container.scrollHeight > container.clientHeight + 1 && scrollbarWidth > 0;
  let topMask = container.querySelector(".scrollbar-arrow-mask.top");
  let bottomMask = container.querySelector(".scrollbar-arrow-mask.bottom");

  if (!topMask) {
    topMask = createScrollbarMask("top");
    container.appendChild(topMask);
  }
  if (!bottomMask) {
    bottomMask = createScrollbarMask("bottom");
    container.appendChild(bottomMask);
  }

  if (!hasVerticalScrollbar) {
    topMask.hidden = true;
    bottomMask.hidden = true;
    return;
  }

  const maskSize = `${scrollbarWidth}px`;
  container.classList.add("scrollbar-mask-host");
  container.style.setProperty("--scrollbar-mask-width", maskSize);
  container.style.setProperty("--scrollbar-mask-height", maskSize);
  topMask.hidden = false;
  bottomMask.hidden = false;
}

function syncScrollbarMasks() {
  SCROLL_MASK_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      syncScrollbarMask(element);
    });
  });
}

function queueScrollbarMaskSync() {
  if (scrollbarMaskFrame) {
    return;
  }

  scrollbarMaskFrame = window.requestAnimationFrame(() => {
    scrollbarMaskFrame = 0;
    syncScrollbarMasks();
  });
}
// END scrollbarMasks.js

// BEGIN item.js
function stringifyValue(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function sanitizeTag(tag) {
  const cleaned = String(tag || "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\[\]()]/g, "")
    .replace(/:\s*-?\d+(\.\d+)?/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length > 64) {
    return "";
  }
  return cleaned;
}

function inferTags(promptText) {
  const tokens = String(promptText || "")
    .split(/[\n,]/)
    .map((part) => sanitizeTag(part))
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  tokens.forEach((token) => {
    const key = token.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(token);
    }
  });
  return unique.slice(0, 18);
}

function stripExtension(fileName) {
  return String(fileName || "").replace(/\.[^.]+$/, "");
}

function titleFromFileName(fileName) {
  const base = stripExtension(fileName).replace(/[_-]+/g, " ").trim();
  return base || "Untitled";
}

function normalizeItem(item) {
  const prompt = String(item.prompt || "").trim();
  const normalizedTags = Array.isArray(item.tags)
    ? item.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : String(item.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

  const tags = normalizedTags.length > 0 ? normalizedTags : inferTags(prompt);
  return {
    id: item.id || crypto.randomUUID(),
    title: item.title || "Untitled",
    image: item.image || "",
    imageBlob: item.imageBlob || null,
    prompt,
    negativePrompt: String(item.negativePrompt || "").trim(),
    model: String(item.model || "Unknown").trim() || "Unknown",
    size: String(item.size || "").trim(),
    tags,
    notes: String(item.notes || "").trim(),
    favorite: Boolean(item.favorite),
    createdAt: item.createdAt || new Date().toISOString(),
    sourceType: String(item.sourceType || "Manual").trim() || "Manual",
    filename: String(item.filename || "").trim(),
    sampler: stringifyValue(item.sampler),
    scheduler: stringifyValue(item.scheduler),
    steps: stringifyValue(item.steps),
    cfg: stringifyValue(item.cfg),
    seed: stringifyValue(item.seed),
    metadataRaw: String(item.metadataRaw || "").trim(),
    workflowRaw: String(item.workflowRaw || "").trim(),
  };
}
// END item.js

// BEGIN helpers.js
function isSupportedImageFile(file) {
  if (!file) {
    return false;
  }
  if (file.type && file.type.startsWith("image/")) {
    return true;
  }
  return /\.(png|jpe?g|webp)$/i.test(file.name || "");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function mapConcurrent(items, limit, mapper, onProgress) {
  const results = new Array(items.length);
  let index = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await mapper(items[current], current);
      completed += 1;
      if (onProgress) {
        onProgress(completed, items.length);
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
// END helpers.js

// BEGIN database.js
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
    sampler: item.sampler,
    scheduler: item.scheduler,
    steps: item.steps,
    cfg: item.cfg,
    seed: item.seed,
    metadataRaw: item.metadataRaw,
    workflowRaw: item.workflowRaw,
    imageBlob: item.imageBlob || null,
  };
}

function fromDbRecord(record) {
  return normalizeItem({
    ...record,
    image: record.imageBlob ? createObjectUrl(record.id, record.imageBlob) : "",
    imageBlob: record.imageBlob || null,
  });
}

async function loadState() {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const records = await requestToPromise(store.getAll());
  await transactionDone(transaction);

  const normalizedRecords = Array.isArray(records) ? records : [];
  state.items = normalizedRecords.map(fromDbRecord);
  state.selectedId = state.items[0]?.id ?? null;
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

async function clearDatabase() {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).clear();
  await transactionDone(transaction);
}
// END database.js

// BEGIN metadata.js
function decodeBytes(bytes, encoding = "utf-8") {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch (error) {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function decompressDeflate(bytes) {
  if (typeof DecompressionStream === "undefined") {
    return null;
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    return null;
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function isPng(bytes) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes) {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isWebp(bytes) {
  return (
    bytes.length > 12 &&
    decodeBytes(bytes.slice(0, 4), "ascii") === "RIFF" &&
    decodeBytes(bytes.slice(8, 12), "ascii") === "WEBP"
  );
}

async function parsePngTextChunks(bytes) {
  const textChunks = {};
  let width = "";
  let height = "";
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const length = view.getUint32(0);
    const type = decodeBytes(bytes.slice(offset + 4, offset + 8), "ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) {
      break;
    }
    const chunkData = bytes.slice(dataStart, dataEnd);

    if (type === "IHDR" && chunkData.length >= 8) {
      const ihdr = new DataView(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength);
      width = String(ihdr.getUint32(0));
      height = String(ihdr.getUint32(4));
    }

    if (type === "tEXt") {
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex !== -1) {
        const key = decodeBytes(chunkData.slice(0, nullIndex), "latin1");
        const value = decodeBytes(chunkData.slice(nullIndex + 1));
        textChunks[key] = value;
      }
    }

    if (type === "iTXt") {
      const keyEnd = chunkData.indexOf(0);
      if (keyEnd !== -1) {
        const key = decodeBytes(chunkData.slice(0, keyEnd), "latin1");
        let cursor = keyEnd + 1;
        const compressionFlag = chunkData[cursor];
        cursor += 2;
        while (cursor < chunkData.length && chunkData[cursor] !== 0) {
          cursor += 1;
        }
        cursor += 1;
        while (cursor < chunkData.length && chunkData[cursor] !== 0) {
          cursor += 1;
        }
        cursor += 1;
        const payload = chunkData.slice(cursor);
        const content = compressionFlag === 1 ? await decompressDeflate(payload) : payload;
        textChunks[key] = content ? decodeBytes(content) : "";
      }
    }

    if (type === "zTXt") {
      const keyEnd = chunkData.indexOf(0);
      if (keyEnd !== -1) {
        const key = decodeBytes(chunkData.slice(0, keyEnd), "latin1");
        const compressed = chunkData.slice(keyEnd + 2);
        const content = await decompressDeflate(compressed);
        textChunks[key] = content ? decodeBytes(content) : "";
      }
    }

    if (type === "IDAT" || type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  return { width, height, textChunks };
}

function getNodeMap(promptJson) {
  if (!promptJson || typeof promptJson !== "object") {
    return {};
  }
  return promptJson;
}

function resolveNode(graph, reference) {
  if (!Array.isArray(reference) || reference.length === 0) {
    return null;
  }
  return graph[String(reference[0])] || null;
}

function findSamplerNode(graph) {
  const preferred = ["KSampler", "KSamplerAdvanced", "SamplerCustom", "SamplerCustomAdvanced", "KSamplerSelect"];
  for (const node of Object.values(graph)) {
    if (preferred.includes(node.class_type)) {
      return node;
    }
  }
  return Object.values(graph).find((node) => String(node.class_type || "").includes("Sampler")) || null;
}

function walkPromptTexts(graph, reference, visited = new Set()) {
  const node = resolveNode(graph, reference);
  if (!node) {
    return [];
  }
  const nodeId = String(reference[0]);
  if (visited.has(nodeId)) {
    return [];
  }
  visited.add(nodeId);

  const results = [];
  const inputs = node.inputs || {};

  if (typeof inputs.text === "string" && inputs.text.trim()) {
    results.push(inputs.text.trim());
  }
  if (typeof inputs.prompt === "string" && inputs.prompt.trim()) {
    results.push(inputs.prompt.trim());
  }

  Object.values(inputs).forEach((value) => {
    if (Array.isArray(value) && value.length > 0) {
      results.push(...walkPromptTexts(graph, value, visited));
    }
  });

  return results;
}

function walkModelName(graph, reference, visited = new Set()) {
  const node = resolveNode(graph, reference);
  if (!node) {
    return "";
  }
  const nodeId = String(reference[0]);
  if (visited.has(nodeId)) {
    return "";
  }
  visited.add(nodeId);

  const inputs = node.inputs || {};
  const direct = inputs.ckpt_name || inputs.model_name || inputs.unet_name || inputs.lora_name;
  if (direct) {
    return String(direct);
  }

  for (const value of Object.values(inputs)) {
    if (Array.isArray(value) && value.length > 0) {
      const nested = walkModelName(graph, value, visited);
      if (nested) {
        return nested;
      }
    }
  }
  return "";
}

function walkSize(graph, reference, visited = new Set()) {
  const node = resolveNode(graph, reference);
  if (!node) {
    return "";
  }
  const nodeId = String(reference[0]);
  if (visited.has(nodeId)) {
    return "";
  }
  visited.add(nodeId);

  const inputs = node.inputs || {};
  if (inputs.width && inputs.height) {
    return `${inputs.width}x${inputs.height}`;
  }

  for (const value of Object.values(inputs)) {
    if (Array.isArray(value) && value.length > 0) {
      const nested = walkSize(graph, value, visited);
      if (nested) {
        return nested;
      }
    }
  }
  return "";
}

function parseComfyMetadataFromTextChunks(textChunks, width, height) {
  const promptJson = safeJsonParse(textChunks.prompt || "");
  const graph = getNodeMap(promptJson);
  const sampler = findSamplerNode(graph);

  let prompt = "";
  let negativePrompt = "";
  let model = "";
  let size = width && height ? `${width}x${height}` : "";
  let samplerName = "";
  let scheduler = "";
  let steps = "";
  let cfg = "";
  let seed = "";

  if (sampler) {
    const inputs = sampler.inputs || {};
    prompt = [...new Set(walkPromptTexts(graph, inputs.positive || []))].join(", ");
    negativePrompt = [...new Set(walkPromptTexts(graph, inputs.negative || []))].join(", ");
    model = walkModelName(graph, inputs.model || []);
    size = walkSize(graph, inputs.latent_image || []) || size;
    samplerName = stringifyValue(inputs.sampler_name || inputs.sampler || sampler.class_type);
    scheduler = stringifyValue(inputs.scheduler);
    steps = stringifyValue(inputs.steps);
    cfg = stringifyValue(inputs.cfg);
    seed = stringifyValue(inputs.seed || inputs.noise_seed);
  }

  if (!prompt) {
    const allTexts = Object.values(graph)
      .flatMap((node) => {
        const value = node?.inputs?.text;
        return typeof value === "string" && value.trim() ? [value.trim()] : [];
      })
      .filter(Boolean);
    prompt = [...new Set(allTexts)].join(", ");
  }

  return {
    sourceType: "ComfyUI",
    prompt,
    negativePrompt,
    model: model || "Unknown",
    size,
    sampler: samplerName,
    scheduler,
    steps,
    cfg,
    seed,
    tags: inferTags(prompt),
    metadataRaw: textChunks.prompt || "",
    workflowRaw: textChunks.workflow || "",
  };
}

function parseSdParameters(parametersText, width = "", height = "") {
  const normalizedText = String(parametersText || "").trim();
  const lines = normalizedText.split(/\r?\n/).filter(Boolean);
  const settingsStart = lines.findIndex((line) => /\bSteps:\s*/.test(line));
  const promptLines = settingsStart === -1 ? lines : lines.slice(0, settingsStart);
  const settingsLines = settingsStart === -1 ? [] : lines.slice(settingsStart);
  const promptBlock = promptLines.join("\n").trim();

  let prompt = promptBlock;
  let negativePrompt = "";
  const marker = "Negative prompt:";
  const markerIndex = promptBlock.indexOf(marker);
  if (markerIndex !== -1) {
    prompt = promptBlock.slice(0, markerIndex).trim();
    negativePrompt = promptBlock.slice(markerIndex + marker.length).trim();
  }

  const settings = {};
  const settingsText = settingsLines.join(" ");
  settingsText
    .split(/,\s(?=[A-Za-z][A-Za-z0-9 _/-]*:\s)/)
    .forEach((segment) => {
      const separator = segment.indexOf(":");
      if (separator === -1) {
        return;
      }
      const key = segment.slice(0, separator).trim();
      const value = segment.slice(separator + 1).trim();
      if (key) {
        settings[key] = value;
      }
    });

  return {
    sourceType: "SD WebUI",
    prompt,
    negativePrompt,
    model: settings.Model || settings["Model name"] || "Unknown",
    size: settings.Size || (width && height ? `${width}x${height}` : ""),
    sampler: settings.Sampler || "",
    scheduler: settings.Scheduler || settings["Schedule type"] || "",
    steps: settings.Steps || "",
    cfg: settings["CFG scale"] || settings.CFG || "",
    seed: settings.Seed || "",
    tags: inferTags(prompt),
    metadataRaw: normalizedText,
    workflowRaw: "",
  };
}

function getAsciiString(view, offset, length) {
  return decodeBytes(new Uint8Array(view.buffer, view.byteOffset + offset, length), "ascii");
}

function decodeExifValue(bytes) {
  const prefix = getAsciiString(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), 0, Math.min(8, bytes.length));
  if (prefix.startsWith("ASCII")) {
    return decodeBytes(bytes.slice(8)).replace(/\0+$/g, "").trim();
  }
  return decodeBytes(bytes).replace(/\0+$/g, "").trim();
}

function parseExifBuffer(bytes) {
  let offsetBase = 0;
  if (bytes.length >= 6 && decodeBytes(bytes.slice(0, 6), "ascii") === "Exif\u0000\u0000") {
    offsetBase = 6;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset + offsetBase, bytes.byteLength - offsetBase);
  const littleEndian = getAsciiString(view, 0, 2) === "II";
  const getUint16 = (offset) => view.getUint16(offset, littleEndian);
  const getUint32 = (offset) => view.getUint32(offset, littleEndian);

  const getEntryRawBytes = (entryOffset, type, count) => {
    const valueOffset = entryOffset + 8;
    const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 7: 1 }[type] || 1;
    const byteCount = count * typeSize;
    const dataOffset = byteCount <= 4 ? valueOffset : getUint32(entryOffset + 8);
    if (dataOffset + byteCount > view.byteLength) {
      return null;
    }
    return new Uint8Array(view.buffer, view.byteOffset + dataOffset, byteCount);
  };

  const readIfd = (offset, store) => {
    if (offset <= 0 || offset >= view.byteLength) {
      return 0;
    }
    const entries = getUint16(offset);
    for (let index = 0; index < entries; index += 1) {
      const entryOffset = offset + 2 + index * 12;
      const tag = getUint16(entryOffset);
      const type = getUint16(entryOffset + 2);
      const count = getUint32(entryOffset + 4);
      const bytesValue = getEntryRawBytes(entryOffset, type, count);
      if (!bytesValue) {
        continue;
      }

      if (tag === 0x8769 || tag === 0x8825) {
        store[tag] = getUint32(entryOffset + 8);
        continue;
      }

      if (type === 4 && count === 1) {
        store[tag] = String(getUint32(entryOffset + 8));
        continue;
      }

      if (type === 3 && count === 1) {
        store[tag] = String(getUint16(entryOffset + 8));
        continue;
      }

      store[tag] = decodeExifValue(bytesValue);
    }

    const nextIfdOffset = offset + 2 + entries * 12;
    if (nextIfdOffset + 4 <= view.byteLength) {
      return getUint32(nextIfdOffset);
    }
    return 0;
  };

  if (getUint16(2) !== 42) {
    return {};
  }

  const tags = {};
  const firstIfd = getUint32(4);
  const nextIfd = readIfd(firstIfd, tags);
  if (tags[0x8769]) {
    readIfd(tags[0x8769], tags);
  }
  if (nextIfd) {
    readIfd(nextIfd, tags);
  }
  return tags;
}

function parseJpegMetadata(bytes) {
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const data = bytes.slice(offset + 4, offset + 2 + length);
    if (marker === 0xe1) {
      const tags = parseExifBuffer(data);
      const parameterText = tags[0x9286] || tags[0x010e] || "";
      if (parameterText && /\bSteps:\s*/.test(parameterText)) {
        return parseSdParameters(parameterText);
      }
    }
    offset += 2 + length;
  }

  return emptyMetadata();
}

function parseWebpMetadata(bytes) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = decodeBytes(bytes.slice(offset, offset + 4), "ascii");
    const chunkSize =
      bytes[offset + 4] |
      (bytes[offset + 5] << 8) |
      (bytes[offset + 6] << 16) |
      (bytes[offset + 7] << 24);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;
    if (chunkDataEnd > bytes.length) {
      break;
    }
    const chunkData = bytes.slice(chunkDataStart, chunkDataEnd);

    if (chunkType === "EXIF") {
      const tags = parseExifBuffer(chunkData);
      const parameterText = tags[0x9286] || tags[0x010e] || "";
      if (parameterText && /\bSteps:\s*/.test(parameterText)) {
        return parseSdParameters(parameterText);
      }
    }
    offset = chunkDataEnd + (chunkSize % 2);
  }

  return emptyMetadata();
}

function emptyMetadata(extra = {}) {
  return {
    sourceType: "Unknown",
    prompt: "",
    negativePrompt: "",
    model: "Unknown",
    size: "",
    sampler: "",
    scheduler: "",
    steps: "",
    cfg: "",
    seed: "",
    tags: [],
    metadataRaw: "",
    workflowRaw: "",
    ...extra,
  };
}

async function extractMetadataFromImage(arrayBuffer, mimeType, fileName) {
  const bytes = new Uint8Array(arrayBuffer);

  if (isPng(bytes) || mimeType === "image/png" || /\.png$/i.test(fileName || "")) {
    const { width, height, textChunks } = await parsePngTextChunks(bytes);
    if (textChunks.prompt || textChunks.workflow) {
      return parseComfyMetadataFromTextChunks(textChunks, width, height);
    }
    if (textChunks.parameters) {
      return parseSdParameters(textChunks.parameters, width, height);
    }
    return emptyMetadata({
      size: width && height ? `${width}x${height}` : "",
      metadataRaw: Object.keys(textChunks).length ? JSON.stringify(textChunks) : "",
    });
  }

  if (isJpeg(bytes) || mimeType === "image/jpeg" || /\.jpe?g$/i.test(fileName || "")) {
    return parseJpegMetadata(bytes);
  }

  if (isWebp(bytes) || mimeType === "image/webp" || /\.webp$/i.test(fileName || "")) {
    return parseWebpMetadata(bytes);
  }

  return emptyMetadata();
}

async function createItemFromFile(file) {
  const metadataSlice = file.slice(0, Math.min(file.size, METADATA_SLICE_BYTES));
  const metadataBuffer = await metadataSlice.arrayBuffer();
  const metadata = await extractMetadataFromImage(metadataBuffer, file.type, file.name);
  const id = crypto.randomUUID();
  const image = createObjectUrl(id, file);
  const title = titleFromFileName(file.name);
  const notes =
    metadata.sourceType === "Unknown"
      ? "未识别到 ComfyUI 或 SD WebUI 元数据，仍已导入图片。"
      : `已从 ${metadata.sourceType} 图片自动提取元数据。`;

  return normalizeItem({
    id,
    title,
    image,
    imageBlob: file,
    prompt: metadata.prompt,
    negativePrompt: metadata.negativePrompt,
    model: metadata.model,
    size: metadata.size,
    tags: metadata.tags,
    notes,
    sourceType: metadata.sourceType,
    filename: file.name,
    sampler: metadata.sampler,
    scheduler: metadata.scheduler,
    steps: metadata.steps,
    cfg: metadata.cfg,
    seed: metadata.seed,
    metadataRaw: metadata.metadataRaw,
    workflowRaw: metadata.workflowRaw,
    createdAt: new Date(file.lastModified || Date.now()).toISOString(),
  });
}
// END metadata.js

// BEGIN render.js
let openViewerHandler = () => {};
const galleryNodeMap = new Map();

function setOpenViewerHandler(handler) {
  openViewerHandler = typeof handler === "function" ? handler : () => {};
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
      void copyTextToClipboard(getDetailCopyText(copyType), label);
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
// END render.js

// BEGIN controller.js
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
// END controller.js

window.promptManagerApp = publicApi;

void initializeApp();
