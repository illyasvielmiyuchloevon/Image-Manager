function parseNovelAiComment(commentText) {
  if (commentText && typeof commentText === "object" && !Array.isArray(commentText)) {
    return commentText;
  }
  const parsed = safeJsonParse(commentText || "");
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function isNovelAiMetadata(textChunks) {
  const software = getTextChunkValue(textChunks, ["Software", "software"]);
  if (/NovelAI/i.test(software)) {
    return true;
  }

  const comment = parseNovelAiComment(getTextChunkValue(textChunks, ["Comment", "comment"]));
  const hasNovelAiSettings = ["uc", "scale", "cfg_rescale", "noise_schedule", "n_samples"].some((key) =>
    Object.prototype.hasOwnProperty.call(comment, key)
  );
  return Boolean(hasNovelAiSettings && getTextChunkValue(textChunks, ["Description", "description", "Prompt", "prompt"]));
}

function parseNovelAiMetadataFromTextChunks(textChunks, width = "", height = "") {
  const commentRaw = getTextChunkValue(textChunks, ["Comment", "comment"]);
  const comment = parseNovelAiComment(commentRaw);
  const prompt = stringifyValue(
    getTextChunkValue(textChunks, ["Description", "description", "Prompt", "prompt"]) ||
      getMetadataValue(comment, ["prompt", "input", "caption"])
  );
  const negativePrompt = stringifyValue(getMetadataValue(comment, ["uc", "negative_prompt", "negativePrompt"]));
  const source = stringifyValue(getTextChunkValue(textChunks, ["Source", "source"]));
  const model = stringifyValue(getMetadataValue(comment, ["model", "model_name", "nai_model", "request_type"]) || source) || "NovelAI";
  const metadataWidth = stringifyValue(getMetadataValue(comment, ["width", "image_width"]));
  const metadataHeight = stringifyValue(getMetadataValue(comment, ["height", "image_height"]));
  const size = metadataWidth && metadataHeight ? `${metadataWidth}x${metadataHeight}` : width && height ? `${width}x${height}` : "";
  const workflowRaw = typeof commentRaw === "string" ? commentRaw : commentRaw ? JSON.stringify(commentRaw, null, 2) : "";
  const rawMetadata = {
    ...textChunks,
    Comment: commentRaw || textChunks.Comment,
  };

  return {
    sourceType: "NovelAI",
    prompt,
    negativePrompt,
    model,
    size,
    sampler: stringifyValue(getMetadataValue(comment, ["sampler"])),
    scheduler: stringifyValue(getMetadataValue(comment, ["noise_schedule", "scheduler"])),
    steps: stringifyValue(getMetadataValue(comment, ["steps"])),
    cfg: stringifyValue(getMetadataValue(comment, ["scale", "cfg", "cfg_scale"])),
    seed: stringifyValue(getMetadataValue(comment, ["seed"])),
    tags: inferTags(prompt),
    metadataRaw: JSON.stringify(rawMetadata, null, 2),
    workflowRaw,
  };
}

function readPackedBitByte(bits, start) {
  let value = 0;
  for (let index = 0; index < 8; index += 1) {
    value = (value << 1) | (bits[start + index] || 0);
  }
  return value;
}

function readStealthBytesFromAlpha(imageData) {
  const { width, height, data } = imageData;
  const byteCount = Math.floor((width * height) / 8);
  const bytes = new Uint8Array(byteCount);
  let byteIndex = 0;
  const bits = new Uint8Array(8);

  for (let cursor = 0; cursor < byteCount * 8; cursor += 8) {
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      const pixelIndex = cursor + bitIndex;
      const x = Math.floor(pixelIndex / height);
      const y = pixelIndex % height;
      bits[bitIndex] = data[(y * width + x) * 4 + 3] & 1;
    }
    bytes[byteIndex] = readPackedBitByte(bits, 0);
    byteIndex += 1;
  }

  return bytes;
}

function readBigEndianUint32(bytes, offset) {
  if (offset + 4 > bytes.length) {
    return null;
  }
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

async function parseNovelAiStealthMetadataFromImageData(imageData) {
  const bytes = readStealthBytesFromAlpha(imageData);
  const magic = "stealth_pngcomp";
  const magicText = decodeBytes(bytes.slice(0, magic.length));
  if (magicText !== magic) {
    return null;
  }

  const bitLength = readBigEndianUint32(bytes, magic.length);
  if (bitLength === null || bitLength % 8 !== 0) {
    return null;
  }

  const payloadLength = bitLength / 8;
  const payloadStart = magic.length + 4;
  const payloadEnd = payloadStart + payloadLength;
  if (payloadLength <= 0 || payloadEnd > bytes.length) {
    return null;
  }

  const decompressed = await decompressGzip(bytes.slice(payloadStart, payloadEnd));
  if (!decompressed) {
    return null;
  }
  const metadata = safeJsonParse(decodeBytes(decompressed));
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  if (metadata.Comment && typeof metadata.Comment === "string") {
    metadata.Comment = parseNovelAiComment(metadata.Comment);
  }
  return parseNovelAiMetadataFromTextChunks(metadata, String(imageData.width), String(imageData.height));
}

async function getImageDataFromBlob(blob) {
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  const bitmap = await createImageBitmap(blob);
  try {
    let canvas = null;
    if (typeof OffscreenCanvas !== "undefined") {
      canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    } else if (typeof document !== "undefined") {
      canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    const context = canvas?.getContext?.("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close?.();
  }
}

async function extractNovelAiStealthMetadataFromBlob(blob) {
  try {
    const imageData = await getImageDataFromBlob(blob);
    return imageData ? await parseNovelAiStealthMetadataFromImageData(imageData) : null;
  } catch (error) {
    console.warn("NovelAI stealth metadata parsing failed", error);
    return null;
  }
}
