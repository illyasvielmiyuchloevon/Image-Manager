# Source Architecture

Prompt Manager still uses plain browser scripts. Files are grouped by responsibility, and `index.html` remains the source of truth for load order.

## Layers

- `core/`: constants, shared state, object URL helpers, generic utilities, thumbnail creation.
- `data/`: gallery item/root normalization and IndexedDB persistence.
- `metadata/`: image metadata parsing chains. This layer must not depend on DOM or UI code.
- `library/`: local folder handles, scanning, synchronization, drag-and-drop import, bulk image import.
- `ui/`: DOM references, filtering/rendering, viewer zoom, custom select, scrollbar helpers.
- `app/`: editor/viewer/gallery actions, event binding, bootstrap, and the public debug API.

## Dependency Rules

- Lower layers should not call higher layers: metadata and data should stay UI-free.
- Shared behavior that is needed across layers belongs in `core/` or `data/`.
- `library/` may use `core/`, `data/`, `metadata/`, and targeted UI hooks for progress/render updates.
- `app/` coordinates everything and owns event binding.

## Load Order

Keep scripts ordered as:

1. `core/`
2. `data/`
3. `metadata/`
4. `ui/`
5. `app/`

This project intentionally avoids modules for now, so top-level functions are shared through classic script scope. When adding a file, place it near the layer it depends on and update `index.html`.
