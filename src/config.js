const DB_NAME = "prompt-manager-db";
const DB_VERSION = 1;
const STORE_NAME = "gallery_items";
const STORAGE_KEY = "prompt-manager.gallery.v4";
const METADATA_SLICE_BYTES = 1024 * 1024;
const IMPORT_CONCURRENCY = Math.min(64, Math.max(8, (navigator.hardwareConcurrency || 8) * 2));
const SCROLL_MASK_SELECTORS = [];


