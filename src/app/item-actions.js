async function upsertItem(item) {
  const existingIndex = state.items.findIndex((entry) => entry.id === item.id);
  const previous = existingIndex >= 0 ? state.items[existingIndex] : null;
  if (previous) {
    item.favorite = previous.favorite;
  }
  const shouldCreateBlobUrl = item.imageBlob && (!previous || previous.imageBlob !== item.imageBlob || !item.image);
  const shouldCreateThumbnailUrl =
    item.thumbnailBlob && (!previous || previous.thumbnailBlob !== item.thumbnailBlob || !item.thumbnailImage);

  await saveItem(item);

  if (shouldCreateBlobUrl) {
    item.image = createObjectUrl(item.id, item.imageBlob);
  }
  if (shouldCreateThumbnailUrl) {
    item.thumbnailImage = createThumbnailObjectUrl(item.id, item.thumbnailBlob);
  }
  if (previous?.imageBlob && !item.imageBlob) {
    revokeItemObjectUrls(previous.id);
  } else if (previous?.thumbnailBlob && !item.thumbnailBlob) {
    revokeObjectUrl(getThumbnailObjectUrlId(previous.id));
  }

  if (existingIndex >= 0) {
    state.items.splice(existingIndex, 1, item);
  } else {
    state.items.unshift(item);
  }
  state.selectedId = item.id;
}

