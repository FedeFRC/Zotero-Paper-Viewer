# Decisions

## Product Direction

The plugin will start as a dedicated gallery viewer, not as a replacement for Zotero's central item table.

Reason: replacing the central item table is more fragile because it touches Zotero's core library UI. A dedicated viewer gives us more control over layout, scrolling, visual polish, and failure states while preserving normal Zotero behavior.

## MVP Name

Working name: `Paper Viewer`.

The name may change later, but it captures the main idea: a visual browsing feed for papers already stored in Zotero.

## Reader Strategy

The MVP will not include a custom PDF reader.

The `Open` button will open the selected PDF in Zotero's native reader. A custom vertical reader can be considered after the gallery experience works well.

## Thumbnail Strategy

The plugin will create its own private thumbnail cache.

It will not create child thumbnail attachments under Zotero parent items.

Reason: thumbnails are derived display data, not research data. Adding them as child attachments would clutter libraries, affect sync/storage, create export noise, and make uninstall behavior messy.

## Preview Source

The MVP will use the first page of the best PDF child attachment for each parent item.

If no local PDF is available, the card should still show metadata and a clear fallback visual.

## Navigation

The first version will use horizontal navigation between papers.

Left/right arrow buttons and keyboard arrow keys are part of the MVP. Vertical X-like feed scrolling can be explored later if horizontal gallery mode feels too constrained.

## Zotero Integration Boundary

Zotero remains the system of record.

The plugin should read from Zotero and open Zotero resources, but it should avoid modifying the user's item hierarchy, collections, metadata, attachments, or notes unless the user explicitly performs an action that requires it.

## Performance Principle

The gallery should never render many PDFs directly while scrolling.

It should show cached thumbnails and generate missing thumbnails lazily in the background.
