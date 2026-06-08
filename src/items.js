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


