const objectUrlMap = new Map();

function getThumbnailObjectUrlId(id) {
  return `${id}:thumbnail`;
}

function revokeObjectUrl(id) {
  const existing = objectUrlMap.get(id);
  if (existing) {
    URL.revokeObjectURL(existing);
    objectUrlMap.delete(id);
  }
}

function createObjectUrl(id, blob) {
  revokeObjectUrl(id);
  const objectUrl = URL.createObjectURL(blob);
  objectUrlMap.set(id, objectUrl);
  return objectUrl;
}

function createThumbnailObjectUrl(id, blob) {
  return createObjectUrl(getThumbnailObjectUrlId(id), blob);
}

function revokeItemObjectUrls(id) {
  revokeObjectUrl(id);
  revokeObjectUrl(getThumbnailObjectUrlId(id));
}

function revokeAllObjectUrls() {
  objectUrlMap.forEach((url) => URL.revokeObjectURL(url));
  objectUrlMap.clear();
}


