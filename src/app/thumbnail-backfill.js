let thumbnailBackfillRunning = false;

async function ensureThumbnailForItem(item) {
  if (!item?.imageBlob || hasCurrentThumbnail(item)) {
    return null;
  }

  const thumbnailBlob = await createThumbnailBlob(item.imageBlob);
  if (!thumbnailBlob) {
    return null;
  }

  const currentItem = state.items.find((entry) => entry.id === item.id) || null;
  if (!currentItem || hasCurrentThumbnail(currentItem) || currentItem.imageBlob !== item.imageBlob) {
    return null;
  }

  const updated = normalizeItem({
    ...currentItem,
    thumbnailBlob,
    thumbnailMaxEdge: THUMBNAIL_MAX_EDGE,
    thumbnailImage: "",
  });
  await saveItem(updated);
  Object.assign(currentItem, updated);
  currentItem.thumbnailImage = createThumbnailObjectUrl(currentItem.id, thumbnailBlob);
  return currentItem;
}

async function backfillMissingThumbnails() {
  if (thumbnailBackfillRunning) {
    return;
  }

  const missingItems = state.items.filter((item) => item.imageBlob && !hasCurrentThumbnail(item));
  if (missingItems.length === 0) {
    return;
  }

  thumbnailBackfillRunning = true;
  try {
    queueThumbnailGeneration(missingItems);
  } finally {
    thumbnailBackfillRunning = false;
  }
}

