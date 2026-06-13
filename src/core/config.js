const DB_NAME = "prompt-manager-db";
const DB_VERSION = 2;
const STORE_NAME = "gallery_items";
const ROOT_STORE_NAME = "library_roots";
const STORAGE_KEY = "prompt-manager.gallery.v4";
const METADATA_SLICE_BYTES = 1024 * 1024;
const IMPORT_CONCURRENCY = 128;
const THUMBNAIL_CONCURRENCY = 128;
const IMPORT_UI_FLUSH_INTERVAL_MS = 100;
const THUMBNAIL_MAX_EDGE = 512;
const THUMBNAIL_MIME_TYPE = "image/webp";
const THUMBNAIL_QUALITY = 0.72;
const GALLERY_ANIMATION_DELAY_STEP_MS = 8;
const GALLERY_ANIMATION_DELAY_MAX_MS = 160;
const LEGACY_ROOT_ID = "legacy-imports";
const DROPPED_ROOT_ID = "dropped-files";
const PASTED_ROOT_ID = "pasted-images";
const SCROLL_MASK_SELECTORS = [];


