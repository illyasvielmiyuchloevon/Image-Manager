const VIEWER_ZOOM_MIN = 1;
const VIEWER_ZOOM_MAX = 6;
const VIEWER_ZOOM_WHEEL_STRENGTH = 0.0016;

const viewerZoomState = {
  initialized: false,
  src: "",
  scale: VIEWER_ZOOM_MIN,
  x: 0,
  y: 0,
  isDragging: false,
  pointerId: null,
  dragStartX: 0,
  dragStartY: 0,
  startX: 0,
  startY: 0,
};

function clampViewerZoom(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getViewerZoomBounds(scale = viewerZoomState.scale) {
  const stage = elements.previewImage;
  const image = elements.previewZoomImage;
  if (!stage || !image) {
    return { maxX: 0, maxY: 0 };
  }

  const stageRect = stage.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height || !imageRect.width || !imageRect.height) {
    return { maxX: 0, maxY: 0 };
  }

  const currentScale = Math.max(viewerZoomState.scale, VIEWER_ZOOM_MIN);
  const baseWidth = imageRect.width / currentScale;
  const baseHeight = imageRect.height / currentScale;
  const scaledWidth = baseWidth * scale;
  const scaledHeight = baseHeight * scale;

  return {
    maxX: Math.max((scaledWidth - stageRect.width) / 2, 0),
    maxY: Math.max((scaledHeight - stageRect.height) / 2, 0),
  };
}

function constrainViewerZoomPan() {
  if (viewerZoomState.scale <= VIEWER_ZOOM_MIN) {
    viewerZoomState.x = 0;
    viewerZoomState.y = 0;
    return;
  }

  const bounds = getViewerZoomBounds();
  viewerZoomState.x = clampViewerZoom(viewerZoomState.x, -bounds.maxX, bounds.maxX);
  viewerZoomState.y = clampViewerZoom(viewerZoomState.y, -bounds.maxY, bounds.maxY);
}

function applyViewerZoomTransform() {
  const stage = elements.previewImage;
  const image = elements.previewZoomImage;
  if (!stage || !image) {
    return;
  }

  constrainViewerZoomPan();
  const scale = Number(viewerZoomState.scale.toFixed(3));
  image.style.transform = `translate3d(${viewerZoomState.x}px, ${viewerZoomState.y}px, 0) scale(${scale})`;
  stage.style.setProperty("--viewer-zoom-scale", scale.toFixed(2));
  stage.classList.toggle("is-zoomed", scale > VIEWER_ZOOM_MIN);
  stage.classList.toggle("is-dragging", viewerZoomState.isDragging);
  stage.classList.toggle("is-empty", !viewerZoomState.src);
}

function resetViewerZoom() {
  viewerZoomState.scale = VIEWER_ZOOM_MIN;
  viewerZoomState.x = 0;
  viewerZoomState.y = 0;
  viewerZoomState.isDragging = false;
  viewerZoomState.pointerId = null;
  applyViewerZoomTransform();
}

function zoomViewerAtPoint(targetScale, clientX, clientY) {
  const stage = elements.previewImage;
  if (!stage || !viewerZoomState.src) {
    return;
  }

  const nextScale = clampViewerZoom(targetScale, VIEWER_ZOOM_MIN, VIEWER_ZOOM_MAX);
  const previousScale = viewerZoomState.scale;
  if (Math.abs(nextScale - previousScale) < 0.001) {
    return;
  }

  const rect = stage.getBoundingClientRect();
  const pointX = clientX - (rect.left + rect.width / 2);
  const pointY = clientY - (rect.top + rect.height / 2);
  const scaleRatio = nextScale / previousScale;

  viewerZoomState.x = pointX - (pointX - viewerZoomState.x) * scaleRatio;
  viewerZoomState.y = pointY - (pointY - viewerZoomState.y) * scaleRatio;
  viewerZoomState.scale = nextScale;
  applyViewerZoomTransform();
}

function setViewerZoomImage(src) {
  const stage = elements.previewImage;
  const image = elements.previewZoomImage;
  if (!stage || !image) {
    return;
  }

  const nextSrc = src || "";
  if (viewerZoomState.src === nextSrc) {
    applyViewerZoomTransform();
    return;
  }

  viewerZoomState.src = nextSrc;
  stage.classList.remove("is-loaded", "is-broken");
  resetViewerZoom();

  if (!nextSrc) {
    image.removeAttribute("src");
    image.alt = "";
    return;
  }

  image.alt = "当前选中的图片预览";
  image.onload = () => {
    if (viewerZoomState.src !== nextSrc) {
      return;
    }
    stage.classList.add("is-loaded");
    applyViewerZoomTransform();
  };
  image.onerror = () => {
    if (viewerZoomState.src !== nextSrc) {
      return;
    }
    stage.classList.add("is-broken");
  };
  image.src = nextSrc;
}

function handleViewerZoomWheel(event) {
  if (!viewerZoomState.src) {
    return;
  }

  event.preventDefault();
  const zoomFactor = Math.exp(-event.deltaY * VIEWER_ZOOM_WHEEL_STRENGTH);
  zoomViewerAtPoint(viewerZoomState.scale * zoomFactor, event.clientX, event.clientY);
}

function handleViewerZoomPointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  if (!viewerZoomState.src || viewerZoomState.scale <= VIEWER_ZOOM_MIN) {
    return;
  }

  viewerZoomState.isDragging = true;
  viewerZoomState.pointerId = event.pointerId;
  viewerZoomState.dragStartX = event.clientX;
  viewerZoomState.dragStartY = event.clientY;
  viewerZoomState.startX = viewerZoomState.x;
  viewerZoomState.startY = viewerZoomState.y;
  elements.previewImage.setPointerCapture(event.pointerId);
  applyViewerZoomTransform();
  event.preventDefault();
}

function handleViewerZoomPointerMove(event) {
  if (!viewerZoomState.isDragging || event.pointerId !== viewerZoomState.pointerId) {
    return;
  }

  viewerZoomState.x = viewerZoomState.startX + event.clientX - viewerZoomState.dragStartX;
  viewerZoomState.y = viewerZoomState.startY + event.clientY - viewerZoomState.dragStartY;
  applyViewerZoomTransform();
  event.preventDefault();
}

function stopViewerZoomDrag(event) {
  if (event && viewerZoomState.pointerId !== null && event.pointerId !== viewerZoomState.pointerId) {
    return;
  }

  viewerZoomState.isDragging = false;
  viewerZoomState.pointerId = null;
  applyViewerZoomTransform();
}

function handleViewerZoomDoubleClick(event) {
  if (!viewerZoomState.src) {
    return;
  }

  event.preventDefault();
  if (viewerZoomState.scale > VIEWER_ZOOM_MIN) {
    resetViewerZoom();
    return;
  }
  zoomViewerAtPoint(2, event.clientX, event.clientY);
}

function initViewerZoom() {
  const stage = elements.previewImage;
  if (!stage || viewerZoomState.initialized) {
    return;
  }

  viewerZoomState.initialized = true;
  stage.addEventListener("wheel", handleViewerZoomWheel, { passive: false });
  stage.addEventListener("pointerdown", handleViewerZoomPointerDown);
  stage.addEventListener("pointermove", handleViewerZoomPointerMove);
  stage.addEventListener("pointerup", stopViewerZoomDrag);
  stage.addEventListener("pointercancel", stopViewerZoomDrag);
  stage.addEventListener("lostpointercapture", stopViewerZoomDrag);
  stage.addEventListener("dblclick", handleViewerZoomDoubleClick);
  window.addEventListener("resize", applyViewerZoomTransform);
}
