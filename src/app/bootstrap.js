async function initializeApp() {
  bindEvents();
  try {
    await loadState();
    state.isInitialized = true;
    render();
    queueScrollbarMaskSync();
    setImportStatus(
      `支持批量导入 ComfyUI / SD WebUI / NovelAI / OpenAI 图片。导入并发 ${IMPORT_CONCURRENCY}，缩略图并发 ${THUMBNAIL_CONCURRENCY}，缩略图最大 512x512。`
    );
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        void backfillMissingThumbnails();
        void syncAuthorizedLibraryRoots({ requestPermission: false, silentIfNone: true });
      }, 500);
    });
  } catch (error) {
    console.error(error);
    setImportStatus("初始化失败：无法打开本地图库数据库。");
  }
}

const publicApi = {
  createItemFromFile,
  extractMetadataFromFile,
  extractMetadataFromImage,
  createThumbnailBlob,
  parseSdParameters,
  parseComfyMetadataFromTextChunks,
  parseNovelAiMetadataFromTextChunks,
  parseOpenAiMetadataFromTextChunks,
  parseOpenAiMetadataFromBytes,
  parseOpenAiMetadataFromBinaryChunks,
  inferTags,
  IMPORT_CONCURRENCY,
  THUMBNAIL_CONCURRENCY,
  THUMBNAIL_MAX_EDGE,
};

window.promptManagerApp = publicApi;

