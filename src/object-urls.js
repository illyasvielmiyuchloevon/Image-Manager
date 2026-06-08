const objectUrlMap = new Map();

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

function revokeAllObjectUrls() {
  objectUrlMap.forEach((url) => URL.revokeObjectURL(url));
  objectUrlMap.clear();
}


