function openViewer(id) {
  const previousId = state.selectedId;
  if (id) {
    state.selectedId = id;
  }
  if (!state.selectedId) {
    return;
  }
  state.viewerOpen = true;
  document.body.style.overflow = "hidden";
  syncGallerySelection(previousId);
  renderViewer();
  const selected = getSelectedItem();
  if (selected && !selected.image && selected.storageMode === "directory") {
    void ensureItemImageAvailable(selected, { request: true }).then(() => {
      if (state.viewerOpen && state.selectedId === selected.id) {
        renderViewer();
      }
    });
  }
}

function closeViewer() {
  state.viewerOpen = false;
  if (typeof resetViewerZoom === "function") {
    resetViewerZoom();
  }
  elements.viewerModal.hidden = true;
  document.body.style.overflow = state.editorOpen ? "hidden" : "";
  queueScrollbarMaskSync();
}

async function toggleFavorite() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }
  const updated = normalizeItem({ ...selected, favorite: !selected.favorite });
  await saveItem(updated);
  Object.assign(selected, updated);
  requestRender();
}

function getDetailCopyText(copyType) {
  const selected = getSelectedItem();
  if (!selected) {
    return "";
  }
  if (copyType === "negativePrompt") {
    return selected.negativePrompt || "";
  }
  return selected.prompt || "";
}

async function copyTextToClipboard(text, label) {
  if (!text) {
    window.alert(`${label} 为空，暂无可复制内容。`);
    return;
  }

  try {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (error) {
        console.warn("Clipboard API text copy failed, falling back to textarea copy.", error);
      }
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
    }

    if (!copied) {
      throw new Error("复制命令未成功执行");
    }
    setImportStatus(`已复制 ${label}。`);
  } catch (error) {
    console.error(error);
    window.alert(`复制 ${label} 失败，请手动选中文本复制。`);
  }
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    if (/^https?:\/\//i.test(source)) {
      image.crossOrigin = "anonymous";
    }
    image.src = source;
  });
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("图片转换失败"));
      }
    }, type);
  });
}

async function createClipboardImageBlob(item) {
  let source = item.image;
  let objectUrl = "";
  if (item.imageBlob) {
    objectUrl = URL.createObjectURL(item.imageBlob);
    source = objectUrl;
  }

  try {
    const image = await loadImageElement(source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      throw new Error("图片尺寸无效");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    return await canvasToBlob(canvas);
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

async function copySelectedImage() {
  const selected = getSelectedItem();
  if (selected && !selected.image) {
    await ensureItemImageAvailable(selected, { request: true });
  }
  if (!selected?.image) {
    window.alert("当前没有可复制的图片。");
    return;
  }
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    window.alert("当前浏览器不支持复制图片到剪贴板。");
    return;
  }

  try {
    const pngBlob = await createClipboardImageBlob(selected);
    await navigator.clipboard.write([new ClipboardItem({ [pngBlob.type]: pngBlob })]);
    setImportStatus("已复制图片。");
  } catch (error) {
    console.error(error);
    window.alert("复制图片失败：如果是远程图片，可能需要允许跨域访问。");
  }
}

function editSelected() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }
  closeViewer();
  openEditor(selected);
}

async function duplicateSelected() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }

  const duplicatedBlob = selected.imageBlob
    ? new File([selected.imageBlob], selected.filename || `${selected.title}.png`, { type: selected.imageBlob.type || "image/png" })
    : null;
  const duplicatedThumbnailBlob = duplicatedBlob ? selected.thumbnailBlob || null : null;
  const copy = normalizeItem({
    ...selected,
    id: crypto.randomUUID(),
    title: `${selected.title} Copy`,
    favorite: false,
    createdAt: new Date().toISOString(),
    imageBlob: duplicatedBlob,
    thumbnailBlob: duplicatedThumbnailBlob,
    image: duplicatedBlob ? "" : selected.image,
    thumbnailImage: duplicatedThumbnailBlob ? "" : selected.thumbnailImage,
  });
  if (duplicatedBlob) {
    copy.image = "";
  }
  await saveItem(copy);
  if (duplicatedBlob) {
    copy.image = createObjectUrl(copy.id, duplicatedBlob);
  }
  if (duplicatedThumbnailBlob) {
    copy.thumbnailImage = createThumbnailObjectUrl(copy.id, duplicatedThumbnailBlob);
  }
  state.items.unshift(copy);
  state.selectedId = copy.id;
  requestRender();
}

async function deleteSelected() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }
  const confirmed = window.confirm(`确定删除 "${selected.title}" 吗？`);
  if (!confirmed) {
    return;
  }

  await deleteItemFromDb(selected.id);
  revokeItemObjectUrls(selected.id);
  state.items = state.items.filter((item) => item.id !== selected.id);
  state.selectedId = state.items[0]?.id ?? null;
  if (!state.selectedId) {
    closeViewer();
  }
  requestRender();
}

