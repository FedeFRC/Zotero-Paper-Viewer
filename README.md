# Paper Feed Viewer

A Zotero 7 desktop plugin that adds a dark paper gallery viewer for the current Zotero item view.

## Current State

This is a working MVP spine tested in Zotero 7.0.32 on Windows. It includes:

- Zotero 7 `manifest.json`
- bootstrapped plugin lifecycle in `bootstrap.js`
- a `Paper Feed` menu item and toolbar entry
- a dark overlay viewer
- left/right keyboard and button navigation
- metadata extraction from the current Zotero item view
- best-PDF child attachment detection
- private first-page thumbnail PNG cache
- lazy thumbnail generation with cached thumbnails loading immediately
- an `Open` button that opens the selected PDF in Zotero's native reader

If a thumbnail cannot be generated, the viewer falls back to the stable placeholder preview surface.

## Build

```powershell
npm run build
```

The generated plugin package is:

```text
dist/paper-feed-viewer-0.2.7.xpi
```

## Install Locally

1. In Zotero, open `Tools` -> `Plugins`.
2. If an older `Paper Feed Viewer` is installed, remove it.
3. Close Zotero completely.
4. Reopen Zotero.
5. Open `Tools` -> `Plugins`.
6. Install `dist/paper-feed-viewer-0.2.7.xpi` with `Install Add-on From File...`.
7. Restart Zotero if prompted.

## Use

1. Select a Zotero collection, search, or item list.
2. Click the `Paper Feed` toolbar button or menu entry.
3. Browse with the left/right buttons or arrow keys.
4. Click `Open` to open the selected PDF in Zotero's native reader.
5. Click `X` or press Escape to close the gallery.

## Zotero Packaging Notes

- Zotero 7.0.32 rejects local plugins if `applications.zotero.update_url` is missing.
- The placeholder `update_url` currently points to `https://example.com/paper-feed-viewer/updates.json`.
- The `.xpi` must store internal paths with forward slashes, for example `content/paperFeed.js`.
- PowerShell `Compress-Archive` can create Windows-style paths that install but fail at runtime, so `scripts/build-xpi.ps1` writes explicit ZIP entries.
- Thumbnail PNGs are cached privately in the Zotero profile under `paper-feed-viewer/thumbnails`.

## MVP Next Steps

1. Test first-page thumbnail generation with small, medium, and large collections.
2. Tighten item-list retrieval if additional Zotero item-tree edge cases appear.
3. Improve viewer polish, loading states, and fallback states.
4. Add cache cleanup for stale thumbnail files.
