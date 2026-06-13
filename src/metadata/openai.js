const OPENAI_METADATA_NEEDLES = [
  "OpenAI",
  "ChatGPT",
  "GPT Image 2",
  "GPT Image 1.5",
  "GPT Image 1",
  "GPT Image",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image",
  "DALL-E 3",
  "DALL·E 3",
  "DALL-E",
  "DALL·E",
  "DALL",
];

function bytesContainText(bytes, text) {
  const needle = new TextEncoder().encode(text);
  if (needle.length === 0 || bytes.length < needle.length) {
    return false;
  }

  for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    let matched = true;
    for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1) {
      if (bytes[index + needleIndex] !== needle[needleIndex]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return true;
    }
  }
  return false;
}

function collectOpenAiMarkersFromText(text) {
  const source = String(text || "");
  return OPENAI_METADATA_NEEDLES.filter((needle) => source.includes(needle));
}

function collectOpenAiMarkersFromTextChunks(textChunks) {
  const markers = new Set();
  Object.entries(textChunks || {}).forEach(([key, value]) => {
    collectOpenAiMarkersFromText(`${key}\n${value}`).forEach((marker) => markers.add(marker));
  });
  return [...markers];
}

function collectOpenAiMarkersFromBytes(bytes) {
  return OPENAI_METADATA_NEEDLES.filter((needle) => bytesContainText(bytes, needle));
}

function getOpenAiModelFromMarkers(markers, metadataText = "") {
  const text = `${markers.join(" ")} ${metadataText}`;
  if (/gpt-image-2|GPT Image 2/i.test(text)) {
    return "GPT Image 2";
  }
  if (/gpt-image-1\.5|GPT Image 1\.5/i.test(text)) {
    return "GPT Image 1.5";
  }
  if (/gpt-image-1|GPT Image 1/i.test(text)) {
    return "GPT Image 1";
  }
  if (/DALL[·-]?E\s*3/i.test(text)) {
    return "DALL-E 3";
  }
  if (/GPT-?4o/i.test(text)) {
    return "GPT-4o Image";
  }
  if (/GPT Image/i.test(text)) {
    return "GPT Image";
  }
  return "OpenAI";
}

function getOpenAiTextMetadataRaw(textChunks, markers) {
  const rawChunks = {};
  Object.entries(textChunks || {}).forEach(([key, value]) => {
    const combined = `${key}\n${value}`;
    if (markers.some((marker) => combined.includes(marker))) {
      rawChunks[key] = value;
    }
  });
  return rawChunks;
}

function parseOpenAiMetadataFromTextChunks(textChunks, width = "", height = "") {
  const markers = collectOpenAiMarkersFromTextChunks(textChunks);
  if (markers.length === 0) {
    return null;
  }

  const rawChunks = getOpenAiTextMetadataRaw(textChunks, markers);
  const metadataText = Object.values(rawChunks).join("\n");
  return {
    sourceType: "OpenAI",
    prompt: "",
    negativePrompt: "",
    model: getOpenAiModelFromMarkers(markers, metadataText),
    size: width && height ? `${width}x${height}` : "",
    sampler: "",
    scheduler: "",
    steps: "",
    cfg: "",
    seed: "",
    tags: [],
    metadataRaw: JSON.stringify(
      {
        kind: "OpenAI provenance metadata",
        detectedMarkers: markers,
        textChunks: rawChunks,
      },
      null,
      2
    ),
    workflowRaw: "",
  };
}

function buildOpenAiMetadata(markers, width = "", height = "", extra = {}) {
  if (markers.length === 0) {
    return null;
  }

  return {
    sourceType: "OpenAI",
    prompt: "",
    negativePrompt: "",
    model: getOpenAiModelFromMarkers(markers),
    size: width && height ? `${width}x${height}` : "",
    sampler: "",
    scheduler: "",
    steps: "",
    cfg: "",
    seed: "",
    tags: [],
    metadataRaw: JSON.stringify(
      {
        kind: "OpenAI provenance metadata",
        detectedMarkers: markers,
        ...extra,
        note: "Detected OpenAI/GPT Image provenance markers in embedded metadata. Prompt and generation parameters are not stored in a ComfyUI-style format.",
      },
      null,
      2
    ),
    workflowRaw: "",
  };
}

function parseOpenAiMetadataFromBytes(bytes, width = "", height = "") {
  return buildOpenAiMetadata(collectOpenAiMarkersFromBytes(bytes), width, height);
}

function parseOpenAiMetadataFromBinaryChunks(binaryChunks = [], width = "", height = "") {
  const markers = new Set();
  const matchedChunks = [];

  binaryChunks.forEach((chunk) => {
    const chunkMarkers = collectOpenAiMarkersFromBytes(chunk.data || new Uint8Array());
    if (chunkMarkers.length === 0) {
      return;
    }
    chunkMarkers.forEach((marker) => markers.add(marker));
    matchedChunks.push({
      type: chunk.type,
      offset: chunk.offset,
      length: chunk.length,
      detectedMarkers: chunkMarkers,
    });
  });

  return buildOpenAiMetadata([...markers], width, height, { chunks: matchedChunks });
}
