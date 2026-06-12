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

async function decompressGzip(bytes) {
  if (typeof DecompressionStream === "undefined") {
    return null;
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    return null;
  }
}

function getPreviousNonWhitespace(text, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(text[cursor])) {
      return text[cursor];
    }
  }
  return "";
}

function getNextNonWhitespace(text, index) {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    if (!/\s/.test(text[cursor])) {
      return text[cursor];
    }
  }
  return "";
}

function normalizeRelaxedJsonNumbers(text) {
  const literals = ["-Infinity", "Infinity", "NaN"];
  let normalized = "";
  let inString = false;
  let escaping = false;
  let cursor = 0;

  while (cursor < text.length) {
    const char = text[cursor];

    if (inString) {
      normalized += char;
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      cursor += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      normalized += char;
      cursor += 1;
      continue;
    }

    const literal = literals.find((value) => text.startsWith(value, cursor));
    if (literal) {
      const previous = getPreviousNonWhitespace(text, cursor);
      const next = getNextNonWhitespace(text, cursor + literal.length);
      const validPrevious = !previous || previous === ":" || previous === "[" || previous === ",";
      const validNext = !next || next === "," || next === "}" || next === "]";
      if (validPrevious && validNext) {
        normalized += "null";
        cursor += literal.length;
        continue;
      }
    }

    normalized += char;
    cursor += 1;
  }

  return normalized;
}

function safeJsonParse(text) {
  const source = String(text || "");
  try {
    return JSON.parse(source);
  } catch (error) {
    const normalizedText = normalizeRelaxedJsonNumbers(source);
    if (normalizedText === source) {
      return null;
    }
    try {
      return JSON.parse(normalizedText);
    } catch (retryError) {
      return null;
    }
  }
}

function getTextChunkValue(textChunks, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(textChunks, key)) {
      return textChunks[key];
    }
  }
  return "";
}

function getMetadataValue(metadata, keys) {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }
  for (const key of keys) {
    const value = metadata[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
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
