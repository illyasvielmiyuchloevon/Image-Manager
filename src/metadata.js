async function extractPngMetadata(bytes, mimeType, fileName) {
  if (!isPng(bytes) && mimeType !== "image/png" && !/\.png$/i.test(fileName || "")) {
    return null;
  }

  const { width, height, textChunks, binaryChunks } = await parsePngTextChunks(bytes);
  if (isNovelAiMetadata(textChunks)) {
    return parseNovelAiMetadataFromTextChunks(textChunks, width, height);
  }
  const openAiTextMetadata = parseOpenAiMetadataFromTextChunks(textChunks, width, height);
  if (openAiTextMetadata) {
    return openAiTextMetadata;
  }
  const openAiChunkMetadata = parseOpenAiMetadataFromBinaryChunks(binaryChunks, width, height);
  if (openAiChunkMetadata) {
    return openAiChunkMetadata;
  }
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

async function extractMetadataFromImage(arrayBuffer, mimeType, fileName) {
  const bytes = new Uint8Array(arrayBuffer);

  try {
    const pngMetadata = await extractPngMetadata(bytes, mimeType, fileName);
    if (pngMetadata) {
      if (pngMetadata.sourceType !== "Unknown") {
        return pngMetadata;
      }
      const openAiBinaryMetadata = parseOpenAiMetadataFromBytes(bytes, "", "");
      if (openAiBinaryMetadata) {
        return {
          ...openAiBinaryMetadata,
          size: pngMetadata.size,
        };
      }
      return pngMetadata;
    }

    if (isJpeg(bytes) || mimeType === "image/jpeg" || /\.jpe?g$/i.test(fileName || "")) {
      const metadata = parseJpegMetadata(bytes);
      return metadata.sourceType === "Unknown" ? parseOpenAiMetadataFromBytes(bytes) || metadata : metadata;
    }

    if (isWebp(bytes) || mimeType === "image/webp" || /\.webp$/i.test(fileName || "")) {
      const metadata = parseWebpMetadata(bytes);
      return metadata.sourceType === "Unknown" ? parseOpenAiMetadataFromBytes(bytes) || metadata : metadata;
    }

    return emptyMetadata();
  } catch (error) {
    console.warn(`Metadata parsing failed for ${fileName || "image"}`, error);
    return emptyMetadata();
  }
}

async function extractMetadataFromFile(file) {
  const metadataSlice = file.slice(0, Math.min(file.size, METADATA_SLICE_BYTES));
  const metadataBuffer = await metadataSlice.arrayBuffer();
  let metadata = await extractMetadataFromImage(metadataBuffer, file.type, file.name);
  const isPngFile = file.type === "image/png" || /\.png$/i.test(file.name || "");

  if (metadata.sourceType === "Unknown" && file.size > metadataSlice.size && isPngFile) {
    const fullMetadataBuffer = await file.arrayBuffer();
    metadata = await extractMetadataFromImage(fullMetadataBuffer, file.type, file.name);
  }
  if (metadata.sourceType === "Unknown" && isPngFile) {
    metadata = (await extractNovelAiStealthMetadataFromBlob(file)) || metadata;
  }

  return metadata;
}

async function getFileHash(file) {
  if (!crypto.subtle?.digest) {
    return "";
  }

  const firstChunk = file.slice(0, Math.min(file.size, METADATA_SLICE_BYTES));
  const lastStart = Math.max(file.size - METADATA_SLICE_BYTES, 0);
  const lastChunk = file.slice(lastStart);
  const [firstBuffer, lastBuffer] = await Promise.all([firstChunk.arrayBuffer(), lastChunk.arrayBuffer()]);
  const header = new TextEncoder().encode(`${file.size}:${firstBuffer.byteLength}:${lastBuffer.byteLength}:`);
  const bytes = new Uint8Array(header.byteLength + firstBuffer.byteLength + lastBuffer.byteLength);
  bytes.set(header, 0);
  bytes.set(new Uint8Array(firstBuffer), header.byteLength);
  bytes.set(new Uint8Array(lastBuffer), header.byteLength + firstBuffer.byteLength);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildPathItemId(rootId, relativePath) {
  const normalizedRootId = String(rootId || "").trim();
  const normalizedPath = normalizePathText(relativePath);
  if (!normalizedRootId || !normalizedPath) {
    return "";
  }
  return `path:${normalizedRootId}:${normalizedPath.toLowerCase()}`;
}

async function createItemFromFile(file, options = {}) {
  const relativePath = normalizePathText(options.relativePath || file.webkitRelativePath || file.name);
  const folderPath = normalizePathText(options.folderPath || folderPathFromRelativePath(relativePath));
  const rootId = String(options.rootId || "").trim();
  const storageMode = String(options.storageMode || "").trim();
  const persistBlob = options.persistBlob !== false;
  const [metadata, fileHash] = await Promise.all([extractMetadataFromFile(file), getFileHash(file)]);
  const pathId = rootId && storageMode !== "legacy" ? buildPathItemId(rootId, relativePath) : "";
  const id = pathId || (fileHash ? `file-${fileHash}` : crypto.randomUUID());
  const image = createObjectUrl(id, file);
  const title = titleFromFileName(file.name);
  const notes =
    metadata.sourceType === "Unknown"
      ? "未识别到 ComfyUI、SD WebUI、NovelAI 或 OpenAI 元数据，仍已导入图片。"
      : `已从 ${metadata.sourceType} 图片自动提取元数据。`;

  return normalizeItem({
    id,
    title,
    image,
    imageBlob: persistBlob ? file : null,
    thumbnailImage: "",
    thumbnailBlob: null,
    prompt: metadata.prompt,
    negativePrompt: metadata.negativePrompt,
    model: metadata.model,
    size: metadata.size,
    tags: metadata.tags,
    notes,
    sourceType: metadata.sourceType,
    filename: file.name,
    fileHash,
    rootId,
    rootName: options.rootName || "",
    relativePath,
    folderPath,
    storageMode: storageMode || (persistBlob ? "blob" : "directory"),
    fileSize: file.size || 0,
    fileLastModified: file.lastModified || 0,
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
