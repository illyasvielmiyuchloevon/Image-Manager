function stringifyValue(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

function normalizeCreatedAt(value) {
  const text = normalizeString(value);
  return Number.isFinite(Date.parse(text)) ? text : new Date().toISOString();
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

function normalizePathText(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/")
    .trim();
}

function folderPathFromRelativePath(relativePath) {
  const normalizedPath = normalizePathText(relativePath);
  const separatorIndex = normalizedPath.lastIndexOf("/");
  return separatorIndex === -1 ? "" : normalizedPath.slice(0, separatorIndex);
}

function getCreatedAtTime(createdAt) {
  const timestamp = Date.parse(createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildItemSearchText(item) {
  return [
    item.title,
    item.prompt,
    item.negativePrompt,
    item.model,
    item.notes,
    item.sourceType,
    item.filename,
    item.fileHash,
    item.rootName,
    item.relativePath,
    item.folderPath,
    item.storageMode,
    item.sampler,
    item.scheduler,
    item.steps,
    item.seed,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ]
    .join(" ")
    .toLowerCase();
}

function normalizeThumbnailMaxEdge(value) {
  const maxEdge = Number(value);
  return Number.isFinite(maxEdge) && maxEdge > 0 ? maxEdge : 0;
}

function hasCurrentThumbnail(item) {
  return Boolean(item?.thumbnailBlob && normalizeThumbnailMaxEdge(item.thumbnailMaxEdge) === THUMBNAIL_MAX_EDGE);
}

function normalizeItem(item) {
  const source = item && typeof item === "object" ? item : {};
  const prompt = String(source.prompt || "").trim();
  const normalizedTags = Array.isArray(source.tags)
    ? source.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : String(source.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

  const tags = normalizedTags.length > 0 ? normalizedTags : inferTags(prompt);
  const createdAt = normalizeCreatedAt(source.createdAt);
  const id = normalizeString(source.id) || crypto.randomUUID();
  const normalized = {
    id,
    title: normalizeString(source.title, "Untitled"),
    image: typeof source.image === "string" ? source.image.trim() : "",
    imageBlob: source.imageBlob instanceof Blob ? source.imageBlob : null,
    thumbnailImage: typeof source.thumbnailImage === "string" ? source.thumbnailImage.trim() : "",
    thumbnailBlob: source.thumbnailBlob instanceof Blob ? source.thumbnailBlob : null,
    thumbnailMaxEdge: source.thumbnailBlob instanceof Blob ? normalizeThumbnailMaxEdge(source.thumbnailMaxEdge) : 0,
    prompt,
    negativePrompt: String(source.negativePrompt || "").trim(),
    model: normalizeString(source.model, "Unknown"),
    size: normalizeString(source.size),
    tags,
    notes: String(source.notes || "").trim(),
    favorite: source.favorite === true,
    createdAt,
    sourceType: normalizeString(source.sourceType, "Manual"),
    filename: normalizeString(source.filename),
    fileHash: normalizeString(source.fileHash),
    rootId: normalizeString(source.rootId),
    rootName: normalizeString(source.rootName),
    relativePath: normalizePathText(source.relativePath),
    folderPath: normalizePathText(source.folderPath || folderPathFromRelativePath(source.relativePath)),
    storageMode: normalizeString(source.storageMode, source.imageBlob instanceof Blob ? "blob" : "indexed"),
    fileSize: Number.isFinite(Number(source.fileSize)) ? Number(source.fileSize) : 0,
    fileLastModified: Number.isFinite(Number(source.fileLastModified)) ? Number(source.fileLastModified) : 0,
    sampler: stringifyValue(source.sampler),
    scheduler: stringifyValue(source.scheduler),
    steps: stringifyValue(source.steps),
    cfg: stringifyValue(source.cfg),
    seed: stringifyValue(source.seed),
    metadataRaw: String(source.metadataRaw || "").trim(),
    workflowRaw: String(source.workflowRaw || "").trim(),
  };
  normalized.createdAtTime = getCreatedAtTime(normalized.createdAt);
  normalized.searchText = buildItemSearchText(normalized);
  return normalized;
}


