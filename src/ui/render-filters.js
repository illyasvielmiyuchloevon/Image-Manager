function renderTagFilters() {
  const tags = getAllTags();
  const fragment = document.createDocumentFragment();

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `chip${state.activeTag === "all" ? " active" : ""}`;
  allButton.textContent = "全部";
  allButton.addEventListener("click", () => {
    state.activeTag = "all";
    requestRender();
  });
  fragment.appendChild(allButton);

  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${state.activeTag === tag ? " active" : ""}`;
    button.textContent = tag;
    button.addEventListener("click", () => {
      state.activeTag = tag;
      requestRender();
    });
    fragment.appendChild(button);
  });

  elements.tagFilters.replaceChildren(fragment);
}

function renderFilters() {
  renderSelect(elements.sourceFilter, state.sourceFilter, "全部来源", getAllSources());
  state.sourceFilter = elements.sourceFilter.value;

  const folderOptions = getAllFolderOptions();
  renderOptionSelect(elements.folderFilter, state.folderFilter, "全部文件夹", folderOptions);
  state.folderFilter = elements.folderFilter.value;

  renderSelect(elements.modelFilter, state.modelFilter, "全部模型", getAllModels());
  state.modelFilter = elements.modelFilter.value;

  syncCustomSelects();
}

function renderStats() {
  const filteredItems = getFilteredItems();
  elements.assetCount.textContent = String(filteredItems.length);
  elements.favoriteCount.textContent = String(filteredItems.filter((item) => item.favorite).length);
  elements.modelCount.textContent = String(getAllFolderOptions().length);
}

