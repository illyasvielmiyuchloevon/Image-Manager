function bindEvents() {
  setOpenViewerHandler(openViewer);
  setDetailCopyHandler((copyType, label) => {
    void copyTextToClipboard(getDetailCopyText(copyType), label);
  });
  if (typeof initViewerZoom === "function") {
    initViewerZoom();
  }

  elements.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    requestRender();
  });

  elements.clearFiltersButton.addEventListener("click", () => {
    state.activeTag = "all";
    state.searchQuery = "";
    state.sourceFilter = "all";
    state.folderFilter = "all";
    state.favoriteFilter = "all";
    state.modelFilter = "all";
    state.sortOrder = "newest";
    elements.searchInput.value = "";
    elements.folderFilter.value = "all";
    elements.favoriteFilter.value = "all";
    elements.sortFilter.value = "newest";
    requestRender();
  });

  elements.sourceFilter.addEventListener("change", (event) => {
    state.sourceFilter = event.target.value;
    requestRender();
  });

  elements.folderFilter.addEventListener("change", (event) => {
    state.folderFilter = event.target.value;
    requestRender();
  });

  elements.modelFilter.addEventListener("change", (event) => {
    state.modelFilter = event.target.value;
    requestRender();
  });

  elements.favoriteFilter.addEventListener("change", (event) => {
    state.favoriteFilter = event.target.value;
    requestRender();
  });

  elements.sortFilter.addEventListener("change", (event) => {
    state.sortOrder = event.target.value;
    requestRender();
  });

  elements.favoriteToggleButton.addEventListener("click", () => {
    void toggleFavorite();
  });
  elements.copyImageButton.addEventListener("click", () => {
    void copySelectedImage();
  });
  elements.editSelectedButton.addEventListener("click", editSelected);
  elements.duplicateButton.addEventListener("click", () => {
    void duplicateSelected();
  });
  elements.deleteButton.addEventListener("click", () => {
    void deleteSelected();
  });
  elements.newEntryButton.addEventListener("click", () => openEditor(null));
  elements.cancelEditButton.addEventListener("click", closeEditor);
  elements.clearFormButton.addEventListener("click", () => populateForm(null));
  elements.entryForm.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });
  elements.imageUploadInput.addEventListener("change", (event) => {
    void handleEditorImageUpload(event);
  });
  elements.imageUrlInput.addEventListener("input", (event) => {
    const value = event.target.value.trim();
    if (value) {
      resetDraftState();
      state.draftMetadata = normalizeItem({
        title: elements.titleInput.value || "Remote Image",
        image: value,
        prompt: elements.promptInput.value,
        negativePrompt: elements.negativePromptInput.value,
        model: elements.modelInput.value || "Unknown",
        size: elements.sizeInput.value,
        tags: elements.tagsInput.value,
        notes: elements.notesInput.value,
        sourceType: "Remote URL",
      });
      refreshUploadPreview(value);
    } else {
      resetDraftState();
      refreshUploadPreview("");
    }
  });

  elements.bulkImportButton.addEventListener("click", () => elements.bulkImageInput.click());
  elements.bulkImageInput.addEventListener("change", (event) => {
    void handleBulkImageImport(event, { sourceLabel: "图片" });
  });
  elements.folderImportButton.addEventListener("click", (event) => {
    event.preventDefault();
    void addLocalDirectoryRoot();
  });
  elements.folderImageInput.addEventListener("change", (event) => {
    void handleFolderSnapshotImport(event);
  });
  elements.syncLibraryButton.addEventListener("click", () => {
    void syncAuthorizedLibraryRoots({ requestPermission: true });
  });
  elements.exportButton.addEventListener("click", () => {
    void exportJson();
  });
  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", importJson);
  elements.resetDemoButton.addEventListener("click", () => {
    void clearGallery();
  });
  elements.closeViewerButton.addEventListener("click", closeViewer);
  elements.viewerBackdrop.addEventListener("click", closeViewer);
  elements.editorPanel.addEventListener("click", (event) => {
    if (event.target === elements.editorPanel) {
      closeEditor();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.viewerOpen) {
        closeViewer();
      }
      if (state.editorOpen) {
        closeEditor();
      }
    }
  });
  window.addEventListener("dragenter", (event) => {
    if (!eventHasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepth += 1;
    setDropOverlayVisible(true);
  });
  window.addEventListener("dragover", (event) => {
    if (!eventHasFiles(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropOverlayVisible(true);
  });
  window.addEventListener("dragleave", (event) => {
    if (!eventHasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepth = Math.max(dragDepth - 1, 0);
    if (dragDepth === 0) {
      setDropOverlayVisible(false);
    }
  });
  window.addEventListener("drop", (event) => {
    if (!eventHasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepth = 0;
    setDropOverlayVisible(false);
    void handleDropImport(event.dataTransfer);
  });
  window.addEventListener("resize", queueScrollbarMaskSync);
  window.addEventListener("beforeunload", () => {
    revokeAllObjectUrls();
    if (state.draftObjectUrl) {
      URL.revokeObjectURL(state.draftObjectUrl);
    }
  });
}

