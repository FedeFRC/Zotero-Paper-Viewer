# TODO

## Milestone 1: Loadable Plugin

- Create Zotero plugin project scaffold.
- Configure plugin ID, name, version, and build output.
- Add basic startup and shutdown lifecycle handlers.
- Add a simple menu item or toolbar entry named `Paper Viewer`.
- Confirm the plugin loads in the targeted Zotero desktop version.

## Milestone 2: Viewer Shell

- Create a full-window dark overlay or viewer surface.
- Add close button.
- Add empty state for no items.
- Add placeholder paper card layout.
- Add left/right navigation buttons.
- Add keyboard navigation for left, right, and escape.

## Milestone 3: Zotero Item Integration

- Read items from the current Zotero collection or search.
- Filter to regular parent items.
- Extract title, creators, year, publication, and item key.
- Find the best PDF child attachment for each parent item.
- Keep the currently displayed paper in sync with Zotero selection where practical.

## Milestone 4: First-Page Preview Cache

- Define plugin-owned thumbnail cache location.
- Generate a stable cache key from library ID, attachment ID or key, file modified time, and file size.
- Render page 1 of a PDF into a small image.
- Save thumbnail images to the plugin cache.
- Load cached thumbnails instantly.
- Queue missing thumbnails in the background.
- Show clear fallback states for missing, unavailable, or unsupported files.

## Milestone 5: Open Actions

- Add `Open in Paper Viewer` button to the paper card.
- Render the selected paper's PDF as vertically scrollable page previews inside Paper Viewer.
- Add `Open in background` button to the paper card.
- Open the selected paper's PDF in Zotero's native reader and show click feedback.
- Handle missing attachment or unavailable local file.

## Milestone 6: Polish

- Add loading state for thumbnail generation.
- Add dark and light theme compatibility if needed.
- Improve card typography and spacing.
- Add smooth transitions between papers.
- Add basic error logging.
- Test with small, medium, and large collections.
- Package a testable `.xpi` plugin build.

## Later Ideas

- Horizontal filmstrip or mini-map.
- Vertical feed mode.
- Zoom controls for in-view PDF previews.
- Higher-quality re-rendering for zoomed PDF previews.
- Read/unread status.
- Tag and color filters.
- Abstract preview.
- Recently added, unread, random, or smart-shuffle modes.
- AI-assisted paper recommendations or summaries.
