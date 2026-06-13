
let scrollbarMaskFrame = 0;

function createScrollbarMask(position) {
  const mask = document.createElement("span");
  mask.className = `scrollbar-arrow-mask ${position}`;
  mask.setAttribute("aria-hidden", "true");
  return mask;
}

function syncScrollbarMask(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const scrollbarWidth = Math.max(container.offsetWidth - container.clientWidth, 0);
  const hasVerticalScrollbar = container.scrollHeight > container.clientHeight + 1 && scrollbarWidth > 0;
  let topMask = container.querySelector(".scrollbar-arrow-mask.top");
  let bottomMask = container.querySelector(".scrollbar-arrow-mask.bottom");

  if (!topMask) {
    topMask = createScrollbarMask("top");
    container.appendChild(topMask);
  }
  if (!bottomMask) {
    bottomMask = createScrollbarMask("bottom");
    container.appendChild(bottomMask);
  }

  if (!hasVerticalScrollbar) {
    topMask.hidden = true;
    bottomMask.hidden = true;
    return;
  }

  const maskSize = `${scrollbarWidth}px`;
  container.classList.add("scrollbar-mask-host");
  container.style.setProperty("--scrollbar-mask-width", maskSize);
  container.style.setProperty("--scrollbar-mask-height", maskSize);
  topMask.hidden = false;
  bottomMask.hidden = false;
}

function syncScrollbarMasks() {
  SCROLL_MASK_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      syncScrollbarMask(element);
    });
  });
}

function queueScrollbarMaskSync() {
  if (scrollbarMaskFrame) {
    return;
  }

  scrollbarMaskFrame = window.requestAnimationFrame(() => {
    scrollbarMaskFrame = 0;
    syncScrollbarMasks();
  });
}


