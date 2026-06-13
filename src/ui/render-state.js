
let openViewerHandler = () => {};
const galleryNodeMap = new Map();
let detailCopyHandler = () => {};
let galleryEventsBound = false;
let renderFrame = 0;
const customSelectMap = new WeakMap();
let customSelectGlobalEventsBound = false;

function setOpenViewerHandler(handler) {
  openViewerHandler = typeof handler === "function" ? handler : () => {};
}

function setDetailCopyHandler(handler) {
  detailCopyHandler = typeof handler === "function" ? handler : () => {};
}

function getAllTags() {
  return [...new Set(state.items.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b));
}

function getAllModels() {
  return [...new Set(state.items.map((item) => item.model).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getAllSources() {
  return [...new Set(state.items.map((item) => item.sourceType).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getFolderFilterValue(item) {
  return `${item.rootId || "unrooted"}::${item.folderPath || ""}`;
}

function getFolderLabel(item) {
  const rootName = item.rootName || "未分组";
  const folderName = item.folderPath || "根目录级文件";
  return `${rootName} / ${folderName}`;
}

function getAllFolderOptions() {
  const optionMap = new Map();
  state.items.forEach((item) => {
    const value = getFolderFilterValue(item);
    if (!optionMap.has(value)) {
      optionMap.set(value, getFolderLabel(item));
    }
  });
  return [...optionMap.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function getFilteredItems() {
  const query = state.searchQuery.trim().toLowerCase();
  return state.items
    .filter((item) => {
      if (state.activeTag !== "all" && !item.tags.includes(state.activeTag)) {
        return false;
      }
      if (state.sourceFilter !== "all" && item.sourceType !== state.sourceFilter) {
        return false;
      }
      if (state.folderFilter !== "all" && getFolderFilterValue(item) !== state.folderFilter) {
        return false;
      }
      if (state.modelFilter !== "all" && item.model !== state.modelFilter) {
        return false;
      }
      if (state.favoriteFilter === "favorites" && !item.favorite) {
        return false;
      }
      if (state.favoriteFilter === "others" && item.favorite) {
        return false;
      }
      if (!query) {
        return true;
      }

      return (item.searchText || buildItemSearchText(item)).includes(query);
    })
    .sort((left, right) => {
      if (state.sortOrder === "oldest") {
        return (left.createdAtTime || getCreatedAtTime(left.createdAt)) - (right.createdAtTime || getCreatedAtTime(right.createdAt));
      }
      if (state.sortOrder === "favorites") {
        if (left.favorite === right.favorite) {
          return (right.createdAtTime || getCreatedAtTime(right.createdAt)) - (left.createdAtTime || getCreatedAtTime(left.createdAt));
        }
        return Number(right.favorite) - Number(left.favorite);
      }
      if (state.sortOrder === "title") {
        return left.title.localeCompare(right.title);
      }
      return (right.createdAtTime || getCreatedAtTime(right.createdAt)) - (left.createdAtTime || getCreatedAtTime(left.createdAt));
    });
}

function getSelectedItem() {
  return state.items.find((item) => item.id === state.selectedId) || null;
}

