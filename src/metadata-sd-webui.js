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
