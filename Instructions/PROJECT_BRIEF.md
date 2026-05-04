# Paper Viewer for Zotero

## Goal

Build a simple Zotero desktop plugin that adds a visual browsing mode for papers. The plugin opens a dark gallery-style viewer where users can move left and right through papers from the current Zotero collection or search.

The MVP should feel like a focused paper gallery, not a replacement for Zotero. Zotero remains the source of truth for collections, metadata, PDFs, and reading.

## MVP Experience

1. The user selects a collection or search in Zotero.
2. The user clicks a `Paper Viewer` button or menu item.
3. A dark full-window viewer opens on top of Zotero.
4. The viewer shows one paper at a time, centered around a first-page preview.
5. The user moves between papers with left/right controls and keyboard arrows.
6. Each paper shows basic metadata: title, creators, year, publication, and attachment status.
7. The user clicks `Open` to open the PDF in Zotero's normal reader.
8. The user clicks `X` to close the viewer and return to normal Zotero.

## Scope

The MVP is a visual discovery layer for existing Zotero items. It should not try to replace Zotero's item table, PDF reader, citation tools, annotation tools, or metadata editor.

## Non-Goals

- Do not replace Zotero's central item list.
- Do not build a full PDF reader in the first version.
- Do not create thumbnail child attachments in Zotero.
- Do not sync generated thumbnails through Zotero storage.
- Do not alter the user's collections, item hierarchy, or attachment structure.

## Core Technical Idea

For each Zotero parent item, find the best child PDF attachment. Render page 1 into a small cached thumbnail owned by the plugin. The gallery loads cached thumbnails instantly and generates missing thumbnails in the background.

The `Open` action should use Zotero's native PDF reader instead of building an in-plugin reader for the MVP.

## Success Criteria

- The plugin can be installed in Zotero 7.
- The user can launch and close the gallery viewer.
- The viewer shows papers from the current collection/search.
- The viewer supports left/right navigation.
- First-page previews load from cache when available.
- Missing previews are generated lazily.
- Clicking `Open` opens the selected paper's PDF in Zotero.
- Normal Zotero state is preserved when closing the viewer.
