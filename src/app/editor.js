function resetDraftState() {
  state.draftVersion += 1;
  if (state.draftObjectUrl) {
    URL.revokeObjectURL(state.draftObjectUrl);
    state.draftObjectUrl = "";
  }
  state.draftBlob = null;
  state.draftMetadata = null;
}

function refreshUploadPreview(image) {
  if (image) {
    elements.uploadPreview.style.backgroundImage = `url("${image}")`;
    elements.uploadPreview.textContent = "";
  } else {
    elements.uploadPreview.style.backgroundImage = "";
    elements.uploadPreview.textContent = "暂无预览";
  }
}

function populateForm(item) {
  if (!item) {
    elements.formHeading.textContent = "新增作品";
    elements.entryId.value = "";
    elements.entryForm.reset();
    resetDraftState();
    refreshUploadPreview("");
    return;
  }

  elements.formHeading.textContent = "编辑作品";
  elements.entryId.value = item.id;
  elements.titleInput.value = item.title;
  elements.imageUrlInput.value = item.imageBlob ? "" : item.image;
  elements.promptInput.value = item.prompt;
  elements.negativePromptInput.value = item.negativePrompt;
  elements.modelInput.value = item.model === "Unknown" ? "" : item.model;
  elements.sizeInput.value = item.size;
  elements.tagsInput.value = item.tags.join(", ");
  elements.notesInput.value = item.notes;
  resetDraftState();
  state.draftBlob = item.imageBlob || null;
  state.draftMetadata = item;
  refreshUploadPreview(item.image);
}

function openEditor(item = null) {
  state.editorOpen = true;
  elements.editorPanel.hidden = false;
  document.body.style.overflow = "hidden";
  populateForm(item);
  queueScrollbarMaskSync();
}

function closeEditor() {
  state.editorOpen = false;
  elements.editorPanel.hidden = true;
  elements.entryForm.reset();
  elements.entryId.value = "";
  resetDraftState();
  refreshUploadPreview("");
  document.body.style.overflow = state.viewerOpen ? "hidden" : "";
  queueScrollbarMaskSync();
}

async function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(elements.entryForm);
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const currentItem = state.items.find((item) => item.id === elements.entryId.value) || null;
  const title = String(formData.get("title") || "").trim();
  if (!title) {
    window.alert("请填写标题。");
    return;
  }

  const remoteUrl = String(formData.get("imageUrl") || "").trim();
  const imageBlob = remoteUrl ? null : state.draftBlob || currentItem?.imageBlob || null;
  const thumbnailBlob = remoteUrl ? null : state.draftMetadata?.thumbnailBlob || currentItem?.thumbnailBlob || null;
  const thumbnailMaxEdge = remoteUrl
    ? 0
    : state.draftMetadata?.thumbnailMaxEdge || currentItem?.thumbnailMaxEdge || 0;
  const id = elements.entryId.value || (remoteUrl ? "" : state.draftMetadata?.id) || crypto.randomUUID();
  let image = "";
  let thumbnailImage = "";

  if (imageBlob) {
    image = currentItem?.imageBlob === imageBlob ? currentItem.image : "";
    thumbnailImage = currentItem?.thumbnailBlob === thumbnailBlob ? currentItem.thumbnailImage : "";
  } else if (remoteUrl) {
    image = remoteUrl;
  }

  if (!image && !imageBlob) {
    window.alert("请先上传图片或填写图片 URL。");
    return;
  }

  const prompt = String(formData.get("prompt") || "").trim();
  const payload = normalizeItem({
    id,
    title,
    image,
    imageBlob,
    thumbnailImage,
    thumbnailBlob,
    thumbnailMaxEdge,
    prompt,
    negativePrompt: formData.get("negativePrompt"),
    model: formData.get("model") || state.draftMetadata?.model || currentItem?.model || "Unknown",
    size: formData.get("size") || state.draftMetadata?.size || currentItem?.size || "",
    tags: tags.length ? tags : inferTags(prompt),
    notes: formData.get("notes"),
    favorite: currentItem?.favorite || false,
    createdAt: currentItem?.createdAt || new Date().toISOString(),
    sourceType: remoteUrl ? "Remote URL" : state.draftMetadata?.sourceType || currentItem?.sourceType || "Manual",
    filename: remoteUrl ? "" : state.draftMetadata?.filename || currentItem?.filename || "",
    fileHash: remoteUrl ? "" : state.draftMetadata?.fileHash || currentItem?.fileHash || "",
    rootId: remoteUrl ? "" : state.draftMetadata?.rootId || currentItem?.rootId || "",
    rootName: remoteUrl ? "" : state.draftMetadata?.rootName || currentItem?.rootName || "",
    relativePath: remoteUrl ? "" : state.draftMetadata?.relativePath || currentItem?.relativePath || "",
    folderPath: remoteUrl ? "" : state.draftMetadata?.folderPath || currentItem?.folderPath || "",
    storageMode: remoteUrl ? "remote" : state.draftMetadata?.storageMode || currentItem?.storageMode || "",
    fileSize: remoteUrl ? 0 : state.draftMetadata?.fileSize || currentItem?.fileSize || 0,
    fileLastModified: remoteUrl ? 0 : state.draftMetadata?.fileLastModified || currentItem?.fileLastModified || 0,
    sampler: state.draftMetadata?.sampler || currentItem?.sampler || "",
    scheduler: state.draftMetadata?.scheduler || currentItem?.scheduler || "",
    steps: state.draftMetadata?.steps || currentItem?.steps || "",
    cfg: state.draftMetadata?.cfg || currentItem?.cfg || "",
    seed: state.draftMetadata?.seed || currentItem?.seed || "",
    metadataRaw: state.draftMetadata?.metadataRaw || currentItem?.metadataRaw || "",
    workflowRaw: state.draftMetadata?.workflowRaw || currentItem?.workflowRaw || "",
  });

  await createThumbnailForItem(payload);
  await upsertItem(payload);
  closeEditor();
  setImportStatus(`已保存：${payload.title}`);
  requestRender();
}

async function handleEditorImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const draftVersion = state.draftVersion + 1;
  state.draftVersion = draftVersion;
  setImportStatus(`正在解析 ${file.name} ...`);
  try {
    const item = await createItemFromFile(file);
    if (draftVersion !== state.draftVersion || !state.editorOpen) {
      revokeItemObjectUrls(item.id);
      return;
    }
    revokeItemObjectUrls(item.id);
    state.draftBlob = file;
    state.draftMetadata = item;
    if (state.draftObjectUrl) {
      URL.revokeObjectURL(state.draftObjectUrl);
    }
    state.draftObjectUrl = URL.createObjectURL(file);
    elements.titleInput.value = item.title;
    elements.promptInput.value = item.prompt;
    elements.negativePromptInput.value = item.negativePrompt;
    elements.modelInput.value = item.model === "Unknown" ? "" : item.model;
    elements.sizeInput.value = item.size;
    elements.tagsInput.value = item.tags.join(", ");
    elements.notesInput.value = item.notes;
    elements.imageUrlInput.value = "";
    refreshUploadPreview(state.draftObjectUrl);
    setImportStatus(`已识别 ${item.sourceType} 元数据：${file.name}`);
  } catch (error) {
    console.error(error);
    setImportStatus(`解析失败：${file.name}`);
    window.alert("图片解析失败，请确认文件是否完整。");
  } finally {
    elements.imageUploadInput.value = "";
  }
}

