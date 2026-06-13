function render() {
  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  }
  renderTagFilters();
  renderFilters();
  renderStats();
  renderGallery();
  renderViewer();
}

function requestRender() {
  if (renderFrame) {
    return;
  }

  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = 0;
    render();
  });
}
