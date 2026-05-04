# Setup

## Requirements

- Zotero 7 desktop.
- A local plugin development environment.
- Node.js and npm or pnpm.
- A Zotero 7 plugin template, preferably a TypeScript-based template.

## Recommended Starting Point

Start from an existing Zotero 7 plugin template rather than a blank folder.

Recommended template:

https://github.com/windingwind/zotero-plugin-template

This gives the project a working plugin structure, build process, and packaging flow.

## Expected Plugin Structure

The exact structure depends on the chosen template, but the project will generally include:

```text
manifest.json
src/
  bootstrap.ts
  modules/
  styles/
package.json
```

Zotero plugins usually define lifecycle behavior such as startup and shutdown. The plugin should use startup to register the `Paper Feed` entry point and shutdown to remove UI it added.

## Development Flow

1. Create the plugin project from a Zotero 7 plugin template.
2. Set the plugin ID, name, description, and version.
3. Build the plugin.
4. Install the generated `.xpi` file into Zotero for testing.
5. Confirm Zotero shows the plugin as enabled.
6. Add a basic `Paper Feed` menu item or toolbar button.
7. Iterate toward the viewer shell and item integration.

## First Local Test

The first useful test is not thumbnail generation. The first useful test is proving that Zotero can load the plugin and display a clickable `Paper Feed` entry.

Once that works, add the dark viewer shell. Then connect the viewer to Zotero items. Thumbnail rendering should come after the viewer can already browse item metadata.

## Cache Notes

The thumbnail cache should be private to the plugin. It should be safe to delete and regenerate.

A cache key should include enough file identity information to detect stale previews, such as:

```text
libraryID
attachment item ID or key
file modified time
file size
```

## MVP Build Order

1. Loadable plugin.
2. `Paper Feed` entry point.
3. Dark viewer shell.
4. Current collection/search item list.
5. Horizontal navigation.
6. Basic metadata card.
7. Open PDF in Zotero reader.
8. First-page thumbnail cache.
9. Polish and packaging.
