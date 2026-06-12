async function canvasToThumbnailBlob(canvas) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({
      type: THUMBNAIL_MIME_TYPE,
      quality: THUMBNAIL_QUALITY,
    });
  }

  return new Promise((resolve) => {
    canvas.toBlob(resolve, THUMBNAIL_MIME_TYPE, THUMBNAIL_QUALITY);
  });
}

function getThumbnailSize(sourceWidth, sourceHeight) {
  const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

async function drawThumbnailSource(source, sourceWidth, sourceHeight) {
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const { width, height } = getThumbnailSize(sourceWidth, sourceHeight);
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    return null;
  }

  context.drawImage(source, 0, 0, width, height);
  return canvasToThumbnailBlob(canvas);
}

function loadImageForThumbnail(imageBlob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(imageBlob);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Thumbnail image load failed"));
    };
    image.src = objectUrl;
  });
}

async function createThumbnailBlob(imageBlob) {
  if (!(imageBlob instanceof Blob)) {
    return null;
  }

  let bitmap = null;
  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(imageBlob);
      return await drawThumbnailSource(bitmap, bitmap.width, bitmap.height);
    }
  } catch (error) {
    console.warn("ImageBitmap thumbnail generation failed, falling back to image decode.", error);
  } finally {
    if (bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
  }

  try {
    const image = await loadImageForThumbnail(imageBlob);
    return await drawThumbnailSource(image, image.naturalWidth || image.width, image.naturalHeight || image.height);
  } catch (error) {
    console.warn("Thumbnail generation failed.", error);
    return null;
  }
}
