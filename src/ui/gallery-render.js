function getGalleryImageSource(item) {
  if (item.thumbnailImage) {
    return item.thumbnailImage;
  }
  return item.imageBlob ? "" : item.image;
}

function updateGalleryThumbnail(item) {
  const node = galleryNodeMap.get(item?.id);
  if (!node) {
    return;
  }

  const thumbImage = node.querySelector(".gallery-thumb-image");
  if (!thumbImage) {
    return;
  }

  const galleryImage = getGalleryImageSource(item);
  node.classList.toggle("thumbnail-pending", Boolean(item.imageBlob && !item.thumbnailImage));
  if (galleryImage) {
    if (thumbImage.getAttribute("src") !== galleryImage) {
      thumbImage.src = galleryImage;
    }
    thumbImage.hidden = false;
  } else {
    thumbImage.removeAttribute("src");
    thumbImage.hidden = true;
  }
}

function renderGallery() {
  const filteredItems = getFilteredItems();
  bindGalleryEvents();
  const previousNodeMap = new Map(galleryNodeMap);
  galleryNodeMap.clear();
  elements.emptyState.hidden = filteredItems.length > 0;
  elements.resultSummary.textContent = `${filteredItems.length} 个结果`;

  if (filteredItems.length === 0) {
    state.selectedId = null;
  } else if (!filteredItems.some((item) => item.id === state.selectedId)) {
    state.selectedId = filteredItems[0].id;
  }

  const activeIds = new Set();
  let cursor = elements.galleryGrid.firstElementChild;
  filteredItems.forEach((item, index) => {
    activeIds.add(item.id);
    const existingNode = previousNodeMap.get(item.id) || null;
    const node = existingNode || elements.galleryItemTemplate.content.firstElementChild.cloneNode(true);
    const animationDelay = Math.min(index * GALLERY_ANIMATION_DELAY_STEP_MS, GALLERY_ANIMATION_DELAY_MAX_MS);
    node.style.setProperty("--delay", existingNode ? "0ms" : `${animationDelay}ms`);
    node.classList.toggle("is-reused", Boolean(existingNode));
    node.classList.toggle("selected", item.id === state.selectedId);
    node.dataset.id = item.id;
    const thumbImage = node.querySelector(".gallery-thumb-image");
    thumbImage.alt = item.title ? `${item.title} 缩略图` : "";
    galleryNodeMap.set(item.id, node);
    updateGalleryThumbnail(item);
    const folderLabel = item.folderPath || item.rootName || item.model;
    node.querySelector(".gallery-model").textContent = `${item.sourceType} · ${folderLabel || "未分组"}`;
    node.querySelector(".gallery-title").textContent = item.title;
    node.querySelector(".gallery-tags").textContent = item.tags.slice(0, 3).join(" · ") || "无 TAG";
    node.querySelector(".gallery-favorite").style.visibility = item.favorite ? "visible" : "hidden";
    if (node !== cursor) {
      elements.galleryGrid.insertBefore(node, cursor);
    } else {
      cursor = cursor.nextElementSibling;
    }
  });

  Array.from(elements.galleryGrid.children).forEach((node) => {
    if (!activeIds.has(node.dataset.id)) {
      node.remove();
    }
  });
}

function bindGalleryEvents() {
  if (galleryEventsBound) {
    return;
  }

  galleryEventsBound = true;
  elements.galleryGrid.addEventListener("click", (event) => {
    const node = event.target.closest(".gallery-item");
    if (!node || !elements.galleryGrid.contains(node)) {
      return;
    }
    openViewerHandler(node.dataset.id);
  });
}

function syncGallerySelection(previousId = null) {
  if (previousId && previousId !== state.selectedId) {
    galleryNodeMap.get(previousId)?.classList.remove("selected");
  }
  galleryNodeMap.get(state.selectedId)?.classList.add("selected");
}

