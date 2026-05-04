# Paper Viewer

A Zotero 7 desktop plugin that adds a dark paper gallery viewer for the current Zotero item view.

## Try It

You do not need to build the plugin to test it.

1. Download the latest XPI:
   [paper-viewer-0.2.8.xpi](https://github.com/FedeFRC/Zotero-Paper-Viewer/releases/latest/download/paper-viewer-0.2.8.xpi)
2. In Zotero, open `Tools` -> `Plugins`.
3. Click the gear icon, then choose `Install Add-on From File...`.
4. Select the downloaded `.xpi` file.
5. Restart Zotero if prompted.

Tested with Zotero `7.0.32` on Windows.

## Use

1. Select a Zotero collection, saved search, or item list that contains papers with PDF attachments.
2. Click the `Paper Viewer` toolbar button, or open it from Zotero's menu.
3. Browse with the left/right buttons or arrow keys.
4. Click `Open` to open the selected PDF in Zotero's native reader.
5. Click `X` or press Escape to close the gallery.

## What To Expect

Paper Viewer shows the current Zotero item view as a dark, keyboard-friendly paper gallery. It includes:

- Zotero 7 `manifest.json`
- bootstrapped plugin lifecycle in `bootstrap.js`
- a `Paper Viewer` menu item and toolbar entry
- a dark overlay viewer
- left/right keyboard and button navigation
- metadata extraction from the current Zotero item view
- best-PDF child attachment detection
- private first-page thumbnail PNG cache
- lazy thumbnail generation with cached thumbnails loading immediately
- an `Open` button that opens the selected PDF in Zotero's native reader

If a thumbnail cannot be generated, the viewer falls back to the stable placeholder preview surface.

## Troubleshooting

If Zotero says the add-on may be incompatible, make sure you downloaded the `.xpi` from the latest release rather than a source-code ZIP.

If `Paper Viewer` installs but does not appear in Zotero, fully close Zotero and reopen it. On Windows, also check that no Zotero process is still running in Task Manager.

If thumbnails show as unavailable, open Zotero's error log and look for `[Paper Viewer]` messages. The viewer should still work, but the log can show whether a PDF path, cache write, or PDF.js render step failed.

## Build From Source

```powershell
npm run build
```

The generated plugin package is:

```text
dist/paper-viewer-0.2.8.xpi
```

Install the locally built package through Zotero's `Tools` -> `Plugins` window.

## Updating A Local Test Install

When testing a new local build:

1. In Zotero, open `Tools` -> `Plugins`.
2. Remove any older `Paper Feed Viewer` or `Paper Viewer` install.
3. Close Zotero completely.
4. Reopen Zotero.
5. Install the new `.xpi`.
6. Restart Zotero if prompted.

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
