"use strict";

var PaperFeedViewer;

function install(data, reason) {}

function uninstall(data, reason) {}

async function startup({ id, version, rootURI, resourceURI }, reason) {
  rootURI = rootURI || resourceURI.spec;

  Zotero.debug("[Paper Viewer] bootstrap startup");
  var { OS } = ChromeUtils.importESModule("chrome://zotero/content/osfile.mjs");
  this.OS = OS;
  this.PathUtils = PathUtils;
  Services.scriptloader.loadSubScript(rootURI + "content/paperFeed.js");
  PaperFeedViewer.startup({ id, version, rootURI });

  for (let win of Zotero.getMainWindows()) {
    PaperFeedViewer.onMainWindowLoad(win);
  }
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  PaperFeedViewer?.shutdown();
  PaperFeedViewer = undefined;
}

function onMainWindowLoad({ window }, reason) {
  Zotero.debug("[Paper Viewer] main window load");
  PaperFeedViewer?.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }, reason) {
  PaperFeedViewer?.onMainWindowUnload(window);
}
