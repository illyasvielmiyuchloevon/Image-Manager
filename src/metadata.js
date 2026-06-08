
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


