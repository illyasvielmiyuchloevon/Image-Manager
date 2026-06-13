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
    if (node && typeof node === "object" && preferred.includes(node.class_type)) {
      return node;
    }
  }
  return Object.values(graph).find((node) => node && typeof node === "object" && String(node.class_type || "").includes("Sampler")) || null;
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

function isConcreteDimension(value) {
  return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim());
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
  if (isConcreteDimension(inputs.width) && isConcreteDimension(inputs.height)) {
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
    size = size || walkSize(graph, inputs.latent_image || []);
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
