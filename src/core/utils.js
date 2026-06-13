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

function getPersistableImageUrl(value) {
  const url = typeof value === "string" ? value.trim() : "";
  return url && !url.startsWith("blob:") ? url : "";
}

function yieldToMainThread() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function mapConcurrent(items, limit, mapper, onProgress) {
  const results = new Array(items.length);
  let index = 0;
  let completed = 0;
  const yieldInterval = Math.max(limit * 2, 1);

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
      if (completed % yieldInterval === 0) {
        await yieldToMainThread();
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}


