"use strict";

var PaperFeedViewer = (function () {
  const MENU_ID_PREFIX = "paper-feed-viewer-menuitem";
  const STYLE_ID = "paper-feed-viewer-styles";
  const OVERLAY_ID = "paper-feed-viewer-overlay";
  const HTML_NS = "http://www.w3.org/1999/xhtml";
  const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  const THUMBNAIL_CACHE_VERSION = 2;
  const THUMBNAIL_MAX_WIDTH = 720;
  const THUMBNAIL_MAX_HEIGHT = 960;
  const THUMBNAIL_MAX_CONCURRENT_JOBS = 2;
  const READER_MAX_PAGE_WIDTH = 920;
  const READER_MAX_PAGE_SCALE = 2;

  const windows = new WeakMap();
  const thumbnailJobs = new Map();
  const pendingThumbnailQueue = [];
  let pluginContext = null;
  let pdfjsLibPromise = null;
  let pdfjsAssetBase = "resource://pdf.js/web/";

  function startup(context) {
    pluginContext = context;
    log("Started Paper Viewer " + context.version);
  }

  function shutdown() {
    for (let win of Zotero.getMainWindows()) {
      onMainWindowUnload(win);
    }
    pluginContext = null;
  }

  function onMainWindowLoad(win) {
    if (!win || windows.has(win)) {
      return;
    }

    const state = {
      menuItems: [],
      toolbarButton: null,
      overlay: null,
      keyHandler: null,
      currentIndex: 0,
      papers: []
    };

    windows.set(win, state);
    installEntryPoints(win, state);
    win.setTimeout(() => installEntryPoints(win, state), 1000);
    win.setTimeout(() => installEntryPoints(win, state), 3000);
  }

  function onMainWindowUnload(win) {
    const state = windows.get(win);
    if (!state) {
      return;
    }

    closeViewer(win);
    for (let menuItem of state.menuItems) {
      menuItem.remove();
    }
    state.toolbarButton?.remove();
    win.document.getElementById(STYLE_ID)?.remove();
    windows.delete(win);
  }

  function installEntryPoints(win, state) {
    installMenuItems(win, state);
    installToolbarButton(win, state);
  }

  function installMenuItems(win, state) {
    const doc = win.document;
    const menus = [
      doc.getElementById("menu_viewPopup"),
      doc.getElementById("menu_ToolsPopup"),
      doc.getElementById("menu-tools-popup")
    ].filter(Boolean);

    if (!menus.length) {
      log("Could not find a Zotero menu popup for Paper Viewer entry point.");
      return;
    }

    menus.forEach((menu, index) => {
      const id = `${MENU_ID_PREFIX}-${index}`;
      if (doc.getElementById(id)) {
        const existing = doc.getElementById(id);
        if (!state.menuItems.includes(existing)) {
          state.menuItems.push(existing);
        }
        return;
      }

      const menuItem = createXULElement(doc, "menuitem");
      menuItem.id = id;
      menuItem.setAttribute("label", "Paper Viewer");
      menuItem.setAttribute("accesskey", "P");
      menuItem.addEventListener("command", () => openViewer(win));

      menu.appendChild(menuItem);
      state.menuItems.push(menuItem);
    });
  }

  function installToolbarButton(win, state) {
    const doc = win.document;
    const toolbar = doc.getElementById("zotero-items-toolbar");
    const existing = doc.getElementById("paper-feed-viewer-toolbar-button");

    if (existing) {
      state.toolbarButton = existing;
      return;
    }

    if (!toolbar) {
      log("Could not find Zotero items toolbar for Paper Viewer button.");
      return;
    }

    const button = createXULElement(doc, "toolbarbutton");
    button.id = "paper-feed-viewer-toolbar-button";
    button.className = "zotero-tb-button";
    button.setAttribute("label", "Paper Viewer");
    button.setAttribute("tooltiptext", "Open Paper Viewer");
    button.setAttribute("tabindex", "-1");
    button.addEventListener("command", () => openViewer(win));

    toolbar.appendChild(button);
    state.toolbarButton = button;
  }

  async function openViewer(win) {
    const state = windows.get(win);
    if (!state) {
      return;
    }

    ensureStyles(win.document);
    state.papers = await collectPapers(win);
    state.currentIndex = clamp(state.currentIndex, 0, Math.max(state.papers.length - 1, 0));

    if (state.overlay) {
      renderViewer(win);
      return;
    }

    const doc = win.document;
    const overlay = html(doc, "div", "pfv-overlay");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Paper Viewer");
    overlay.setAttribute("tabindex", "-1");

    doc.documentElement.appendChild(overlay);
    state.overlay = overlay;

    state.keyHandler = (event) => {
      if (!state.overlay) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer(win);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious(win);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext(win);
      }
    };

    doc.addEventListener("keydown", state.keyHandler, true);
    renderViewer(win);
    queueVisibleThumbnails(win);
    overlay.focus();
  }

  function closeViewer(win) {
    const state = windows.get(win);
    if (!state) {
      return;
    }

    if (state.keyHandler) {
      win.document.removeEventListener("keydown", state.keyHandler, true);
      state.keyHandler = null;
    }

    removePendingThumbnailsForWindow(win);
    for (let paper of state.papers) {
      revokeReaderResources(win, paper);
    }
    state.overlay?.remove();
    state.overlay = null;
  }

  function renderViewer(win) {
    const state = windows.get(win);
    if (!state?.overlay) {
      return;
    }

    const doc = win.document;
    const paper = state.papers[state.currentIndex];
    state.overlay.replaceChildren();

    const header = html(doc, "header", "pfv-header");
    const titleGroup = html(doc, "div", "pfv-title-group");
    titleGroup.append(
      html(doc, "div", "pfv-kicker", "Paper Viewer"),
      html(doc, "div", "pfv-count", state.papers.length ? `${state.currentIndex + 1} of ${state.papers.length}` : "No papers")
    );

    const closeButton = html(doc, "button", "pfv-icon-button", "X");
    closeButton.setAttribute("type", "button");
    closeButton.setAttribute("aria-label", "Close Paper Viewer");
    closeButton.addEventListener("click", () => closeViewer(win));

    header.append(titleGroup, closeButton);

    const main = html(doc, "main", "pfv-main");
    const previousButton = html(doc, "button", "pfv-nav-button", "<");
    previousButton.setAttribute("type", "button");
    previousButton.setAttribute("aria-label", "Previous paper");
    previousButton.disabled = !state.papers.length || state.currentIndex === 0;
    previousButton.addEventListener("click", () => showPrevious(win));

    const nextButton = html(doc, "button", "pfv-nav-button", ">");
    nextButton.setAttribute("type", "button");
    nextButton.setAttribute("aria-label", "Next paper");
    nextButton.disabled = !state.papers.length || state.currentIndex >= state.papers.length - 1;
    nextButton.addEventListener("click", () => showNext(win));

    main.append(previousButton, renderCard(doc, paper, win), nextButton);

    const footer = html(doc, "footer", "pfv-footer");
    footer.append(
      html(doc, "span", "pfv-status", "Use left and right arrow keys to browse."),
      html(doc, "span", "pfv-status", pluginContext ? "v" + pluginContext.version : "")
    );

    state.overlay.append(header, main, footer);
    queueVisibleThumbnails(win);
  }

  function renderCard(doc, paper, win) {
    const card = html(doc, "section", paper?.readerMode ? "pfv-card pfv-card-reading" : "pfv-card");

    if (!paper) {
      card.append(
        html(doc, "div", "pfv-preview pfv-preview-empty", "No papers"),
        html(doc, "h1", "pfv-paper-title", "Nothing to show here yet"),
        html(doc, "p", "pfv-paper-detail", "Select a collection, saved search, or one or more regular Zotero items, then open Paper Viewer again.")
      );
      return card;
    }

    const preview = renderPreview(doc, paper, win);

    const meta = html(doc, "div", "pfv-meta");
    meta.append(
      html(doc, "h1", "pfv-paper-title", paper.title),
      html(doc, "div", "pfv-creators", paper.creators),
      metadataRow(doc, "Year", paper.year),
      metadataRow(doc, "Publication", paper.publication),
      metadataRow(doc, "Attachment", paper.attachmentStatus)
    );

    const actions = html(doc, "div", "pfv-actions");
    const readButton = html(doc, "button", "pfv-primary-button", "Open in Paper Viewer");
    readButton.setAttribute("type", "button");
    readButton.disabled = !paper.attachmentID || paper.readerStatus === "loading";
    readButton.addEventListener("click", () => openPaperInViewer(win, paper));

    const backgroundButton = html(doc, "button", "pfv-secondary-button", "Open in background");
    backgroundButton.setAttribute("type", "button");
    backgroundButton.disabled = !paper.attachmentID;
    backgroundButton.addEventListener("click", () => openAttachmentInBackground(win, paper));
    actions.append(readButton, backgroundButton);
    if (paper.backgroundOpenStatus === "opened") {
      actions.append(html(doc, "div", "pfv-action-feedback", "Opened in Zotero"));
    }

    meta.append(actions);
    card.append(preview, meta);
    return card;
  }

  function renderPreview(doc, paper, win) {
    const preview = html(doc, "div", "pfv-preview");

    if (paper.readerMode) {
      return renderPDFReader(doc, paper);
    }

    if (paper.thumbnailURL) {
      const image = html(doc, "img", "pfv-thumbnail");
      image.setAttribute("src", paper.thumbnailURL);
      image.setAttribute("alt", "");
      preview.append(image);
      return preview;
    }

    const label = paper.hasPDF
      ? paper.thumbnailStatusText || "Generating first-page preview..."
      : "No local PDF found";

    preview.append(
      html(doc, "div", paper.thumbnailStatus === "loading" ? "pfv-page-shape pfv-page-shape-loading" : "pfv-page-shape"),
      html(doc, "div", "pfv-preview-label", label)
    );
    return preview;
  }

  function renderPDFReader(doc, paper) {
    const reader = html(doc, "div", "pfv-pdf-reader");

    if (paper.readerStatus === "failed") {
      reader.append(
        html(doc, "div", "pfv-reader-message", paper.readerStatusText || "PDF preview unavailable")
      );
      return reader;
    }

    if (paper.readerPages?.length) {
      const pages = html(doc, "div", "pfv-reader-pages");
      for (let page of paper.readerPages) {
        const image = html(doc, "img", "pfv-reader-page");
        image.setAttribute("src", page.url);
        image.setAttribute("alt", "Page " + page.pageNumber);
        image.setAttribute("width", String(page.width));
        image.setAttribute("height", String(page.height));
        pages.append(image);
      }
      reader.append(pages);
    }

    if (paper.readerStatus === "loading") {
      reader.append(
        html(doc, "div", "pfv-reader-message", paper.readerStatusText || "Loading PDF...")
      );
    }

    if (!paper.readerPages?.length && paper.readerStatus !== "loading") {
      reader.append(
        html(doc, "div", "pfv-reader-message", "Click Open in Paper Viewer to read this PDF here.")
      );
    }

    return reader;
  }

  function metadataRow(doc, label, value) {
    const row = html(doc, "div", "pfv-metadata-row");
    row.append(html(doc, "span", "pfv-metadata-label", label), html(doc, "span", "pfv-metadata-value", value || "Unknown"));
    return row;
  }

  function showPrevious(win) {
    const state = windows.get(win);
    if (!state || !state.papers.length) {
      return;
    }
    closeCurrentPaperReader(win, state);
    state.currentIndex = clamp(state.currentIndex - 1, 0, state.papers.length - 1);
    renderViewer(win);
  }

  function showNext(win) {
    const state = windows.get(win);
    if (!state || !state.papers.length) {
      return;
    }
    closeCurrentPaperReader(win, state);
    state.currentIndex = clamp(state.currentIndex + 1, 0, state.papers.length - 1);
    renderViewer(win);
  }

  function closeCurrentPaperReader(win, state) {
    const paper = state.papers[state.currentIndex];
    if (!paper?.readerMode) {
      return;
    }

    revokeReaderResources(win, paper);
    paper.readerMode = false;
    paper.readerStatus = null;
    paper.readerStatusText = null;
    paper.readerPages = [];
  }

  async function collectPapers(win) {
    const items = await getVisibleOrSelectedItems(win);
    const parentItems = items.filter((item) => {
      try {
        return item && item.isRegularItem && item.isRegularItem() && !item.isFeedItem;
      }
      catch (error) {
        return false;
      }
    });

    const papers = [];
    for (let item of parentItems) {
      papers.push(await toPaper(item));
    }
    return papers;
  }

  async function getVisibleOrSelectedItems(win) {
    const pane = win.ZoteroPane;
    const itemTree = pane?.itemsView || pane?.itemTreeView;
    const attempts = [
      () => itemTree?.getSortedItems?.(),
      () => itemTree?.getSortedItems?.(true),
      () => itemTree?.getVisibleItems?.(),
      () => pane?.getSelectedItems?.(),
      () => pane?.getSelectedItems?.(false)
    ];

    for (let attempt of attempts) {
      try {
        const result = await attempt();
        const items = normalizeItems(result);
        if (items.length) {
          return items;
        }
      }
      catch (error) {
        // Try the next Zotero API shape.
      }
    }

    return [];
  }

  function normalizeItems(value) {
    if (!value) {
      return [];
    }

    const values = Array.from(value);
    return values
      .map((entry) => {
        if (entry && typeof entry === "object" && entry.id) {
          return entry;
        }
        if (typeof entry === "number") {
          return Zotero.Items.get(entry);
        }
        return null;
      })
      .filter(Boolean);
  }

  async function toPaper(item) {
    const attachment = await findBestPDFAttachment(item);
    const title = getField(item, "title") || item.getDisplayTitle?.() || "Untitled paper";
    const creators = formatCreators(item);
    const year = extractYear(getField(item, "date"));
    const publication =
      getField(item, "publicationTitle") ||
      getField(item, "bookTitle") ||
      getField(item, "proceedingsTitle") ||
      getField(item, "conferenceName") ||
      "Unknown";
    const thumbnail = attachment ? await getThumbnailInfo(attachment) : null;

    return {
      itemID: item.id,
      itemKey: item.key,
      attachmentID: attachment?.id || null,
      title,
      creators,
      year,
      publication,
      hasPDF: Boolean(attachment),
      attachmentStatus: attachment ? await getAttachmentStatus(attachment) : "No PDF attachment",
      thumbnailCacheKey: thumbnail?.cacheKey || null,
      thumbnailPath: thumbnail?.path || null,
      thumbnailURL: thumbnail?.url || null,
      thumbnailStatus: thumbnail?.url ? "ready" : thumbnail?.status || "missing",
      thumbnailStatusText: thumbnail?.statusText || null,
      readerMode: false,
      readerStatus: null,
      readerStatusText: null,
      readerPages: [],
      readerObjectURLs: [],
      readerJob: null,
      backgroundOpenStatus: null,
      backgroundOpenTimer: null
    };
  }

  function queueVisibleThumbnails(win) {
    const state = windows.get(win);
    if (!state?.overlay || !state.papers.length) {
      return;
    }

    const indexes = [
      state.currentIndex,
      state.currentIndex - 1,
      state.currentIndex + 1,
      state.currentIndex - 2,
      state.currentIndex + 2
    ];

    for (let index of indexes) {
      const paper = state.papers[index];
      if (paper) {
        queueThumbnail(win, paper);
      }
    }
  }

  function queueThumbnail(win, paper) {
    if (!paper.hasPDF || !paper.attachmentID || paper.thumbnailURL || !paper.thumbnailCacheKey) {
      return;
    }
    if (paper.thumbnailStatus === "loading" || paper.thumbnailStatus === "queued" || paper.thumbnailStatus === "failed") {
      return;
    }

    const jobKey = paper.thumbnailCacheKey;
    if (thumbnailJobs.has(jobKey)) {
      return;
    }

    if (pendingThumbnailQueue.some((entry) => entry.jobKey === jobKey)) {
      return;
    }

    paper.thumbnailStatus = "queued";
    paper.thumbnailStatusText = "Preview queued";
    pendingThumbnailQueue.push({ win, paper, jobKey });
    processThumbnailQueue();
    renderViewer(win);
  }

  function processThumbnailQueue() {
    while (thumbnailJobs.size < THUMBNAIL_MAX_CONCURRENT_JOBS && pendingThumbnailQueue.length) {
      const entry = pendingThumbnailQueue.shift();
      const { win, paper, jobKey } = entry;

      if (!windows.has(win) || !paper || paper.thumbnailURL || paper.thumbnailStatus === "failed") {
        continue;
      }

      paper.thumbnailStatus = "loading";
      paper.thumbnailStatusText = "Generating preview...";

      const job = generateThumbnail(win, paper)
      .then((result) => {
        if (result?.url) {
          paper.thumbnailURL = result.url;
          paper.thumbnailPath = result.path;
          paper.thumbnailStatus = "ready";
          paper.thumbnailStatusText = "First-page preview";
        }
        else {
          paper.thumbnailStatus = "failed";
          paper.thumbnailStatusText = "Preview unavailable";
        }
      })
      .catch((error) => {
        paper.thumbnailStatus = "failed";
        paper.thumbnailStatusText = "Preview unavailable";
        log("Thumbnail generation failed for attachment " + paper.attachmentID + ": " + error);
      })
      .finally(() => {
        thumbnailJobs.delete(jobKey);
        renderViewer(win);
        processThumbnailQueue();
      });

      thumbnailJobs.set(jobKey, job);
      renderViewer(win);
    }
  }

  function removePendingThumbnailsForWindow(win) {
    for (let i = pendingThumbnailQueue.length - 1; i >= 0; i--) {
      if (pendingThumbnailQueue[i].win === win) {
        const { paper } = pendingThumbnailQueue[i];
        if (paper?.thumbnailStatus === "queued") {
          paper.thumbnailStatus = "missing";
          paper.thumbnailStatusText = "Preview queued";
        }
        pendingThumbnailQueue.splice(i, 1);
      }
    }
  }

  async function findBestPDFAttachment(item) {
    let attachmentIDs = [];
    try {
      attachmentIDs = item.getAttachments ? item.getAttachments() : [];
    }
    catch (error) {
      return null;
    }

    for (let id of attachmentIDs) {
      const attachment = Zotero.Items.get(id);
      if (!attachment) {
        continue;
      }

      const contentType = attachment.attachmentContentType || "";
      const title = getField(attachment, "title").toLowerCase();
      const isPDF =
        attachment.isPDFAttachment?.() ||
        contentType === "application/pdf" ||
        title.endsWith(".pdf");

      if (isPDF) {
        return attachment;
      }
    }

    return null;
  }

  async function getAttachmentStatus(attachment) {
    try {
      if (attachment.fileExists && !(await attachment.fileExists())) {
        return "PDF attachment, file unavailable";
      }
    }
    catch (error) {
      return "PDF attachment";
    }

    return "PDF attachment ready";
  }

  async function getThumbnailInfo(attachment) {
    try {
      const filePath = await attachment.getFilePathAsync?.();
      if (!filePath || !(await OS.File.exists(filePath))) {
        return {
          status: "failed",
          statusText: "PDF file unavailable"
        };
      }

      const stat = await OS.File.stat(filePath);
      const modified = stat.lastModificationDate ? stat.lastModificationDate.getTime() : 0;
      const size = stat.size || 0;
      const cacheKey = [
        "v" + THUMBNAIL_CACHE_VERSION,
        attachment.libraryID,
        attachment.key || attachment.id,
        modified,
        size
      ].join("-");
      const path = await getThumbnailPath(cacheKey);

      if (await OS.File.exists(path)) {
        return {
          cacheKey,
          path,
          url: pathToFileURL(path),
          status: "ready",
          statusText: "Cached first-page preview"
        };
      }

      return {
        cacheKey,
        path,
        status: "missing",
        statusText: "Preview queued"
      };
    }
    catch (error) {
      log("Could not inspect thumbnail cache for attachment " + attachment.id + ": " + error);
      return {
        status: "failed",
        statusText: "Preview unavailable"
      };
    }
  }

  async function generateThumbnail(win, paper) {
    const attachment = Zotero.Items.get(paper.attachmentID);
    if (!attachment) {
      throw new Error("Attachment not found");
    }

    const filePath = await attachment.getFilePathAsync?.();
    if (!filePath || !(await OS.File.exists(filePath))) {
      throw new Error("PDF file not found");
    }

    const outputPath = paper.thumbnailPath || (await getThumbnailPath(paper.thumbnailCacheKey));
    if (await OS.File.exists(outputPath)) {
      return {
        path: outputPath,
        url: pathToFileURL(outputPath)
      };
    }

    const pdfjsLib = await getPDFJSLib(win);
    const data = await OS.File.read(filePath);
    const loadingTask = pdfjsLib.getDocument(getPDFDocumentOptions(win, data));

    let pdf = null;
    try {
      pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        THUMBNAIL_MAX_WIDTH / baseViewport.width,
        THUMBNAIL_MAX_HEIGHT / baseViewport.height,
        1.6
      );
      const viewport = page.getViewport({ scale });
      const canvas = win.document.createElementNS(HTML_NS, "canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("Could not create 2D canvas context");
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: context,
        viewport
      }).promise;

      await writeCanvasPNG(win, canvas, outputPath);
      return {
        path: outputPath,
        url: pathToFileURL(outputPath)
      };
    }
    finally {
      try {
        await pdf?.destroy();
      }
      catch (error) {}
    }
  }

  async function getPDFJSLib(win) {
    if (!pdfjsLibPromise) {
      pdfjsLibPromise = Promise.resolve().then(() => {
        const errors = [];

        try {
          const pdfjsLib = ChromeUtils.importESModule("resource://zotero/reader/pdf/build/pdf.mjs");
          pdfjsLib.GlobalWorkerOptions.workerSrc = "resource://zotero/reader/pdf/build/pdf.worker.mjs";
          pdfjsAssetBase = "resource://zotero/reader/pdf/web/";
          return pdfjsLib;
        }
        catch (error) {
          errors.push("resource://zotero/reader/pdf/build/pdf.mjs: " + error);
        }

        try {
          const pdfjsLib = ChromeUtils.importESModule("resource://reader/pdf/build/pdf.mjs");
          pdfjsLib.GlobalWorkerOptions.workerSrc = "resource://reader/pdf/build/pdf.worker.mjs";
          pdfjsAssetBase = "resource://reader/pdf/web/";
          return pdfjsLib;
        }
        catch (error) {
          errors.push("resource://reader/pdf/build/pdf.mjs: " + error);
        }

        try {
          if (!win.pdfjsLib) {
            Services.scriptloader.loadSubScript("resource://pdf.js/build/pdf.js", win);
          }
          win.pdfjsLib.GlobalWorkerOptions.workerSrc = "resource://pdf.js/build/pdf.worker.js";
          pdfjsAssetBase = "resource://pdf.js/web/";
          return win.pdfjsLib;
        }
        catch (error) {
          errors.push("resource://pdf.js/build/pdf.js: " + error);
        }

        throw new Error("Could not load Zotero PDF.js. Tried " + errors.join("; "));
      });
    }
    return pdfjsLibPromise;
  }

  function getPDFJSAssetURL(path) {
    return pdfjsAssetBase + path;
  }

  function getPDFDocumentOptions(win, data) {
    return {
      data,
      ownerDocument: win.document,
      cMapUrl: getPDFJSAssetURL("cmaps/"),
      cMapPacked: true,
      standardFontDataUrl: getPDFJSAssetURL("standard_fonts/"),
      disableFontFace: true,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: false,
      useSystemFonts: false,
      useWorkerFetch: false,
      useWasm: false
    };
  }

  async function getThumbnailPath(cacheKey) {
    const baseDir = getPluginCacheDir();
    const dir = joinPath(baseDir, "thumbnails");
    await Zotero.File.createDirectoryIfMissingAsync(baseDir);
    await Zotero.File.createDirectoryIfMissingAsync(dir);
    return joinPath(dir, cacheKey.replace(/[^A-Za-z0-9_.-]/g, "_") + ".png");
  }

  function getPluginCacheDir() {
    const profileDir = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile).path;
    return joinPath(profileDir, "paper-feed-viewer");
  }

  function joinPath(...parts) {
    if (typeof PathUtils !== "undefined" && PathUtils.join) {
      return PathUtils.join(...parts);
    }
    return OS.Path.join(...parts);
  }

  function pathToFileURL(path) {
    const file = Components.classes["@mozilla.org/file/local;1"]
      .createInstance(Components.interfaces.nsIFile);
    file.initWithPath(path);
    return Services.io.newFileURI(file).spec;
  }

  async function writeCanvasPNG(win, canvas, path) {
    const blob = await canvasToPNGBlob(canvas);
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    await OS.File.writeAtomic(path, bytes, {
      tmpPath: path + ".tmp"
    });
  }

  function canvasToPNGBlob(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
          }
          else {
            reject(new Error("Canvas did not produce PNG blob"));
          }
        }, "image/png");
      }
      catch (error) {
        reject(new Error("Canvas toBlob failed: " + error));
      }
    });
  }

  function getField(item, field) {
    try {
      return item.getField?.(field) || "";
    }
    catch (error) {
      return "";
    }
  }

  function formatCreators(item) {
    try {
      const creators = item.getCreators?.() || [];
      if (!creators.length) {
        return "Unknown creators";
      }

      const names = creators.slice(0, 4).map((creator) => {
        if (creator.name) {
          return creator.name;
        }
        return [creator.firstName, creator.lastName].filter(Boolean).join(" ");
      }).filter(Boolean);

      if (creators.length > names.length) {
        names.push("et al.");
      }

      return names.join(", ") || "Unknown creators";
    }
    catch (error) {
      return "Unknown creators";
    }
  }

  function extractYear(date) {
    const match = String(date || "").match(/\b(15|16|17|18|19|20|21)\d{2}\b/);
    return match ? match[0] : "Unknown";
  }

  async function openPaperInViewer(win, paper) {
    if (!paper.attachmentID) {
      return;
    }

    paper.readerMode = true;
    if (!paper.readerStatus) {
      paper.readerStatus = "loading";
      paper.readerStatusText = "Loading PDF...";
    }
    renderViewer(win);

    if (paper.readerJob || paper.readerStatus === "ready") {
      return;
    }

    paper.readerJob = renderAttachmentInPaperViewer(win, paper)
      .catch((error) => {
        if (!isPaperViewerOpen(win, paper)) {
          return;
        }
        paper.readerStatus = "failed";
        paper.readerStatusText = "PDF preview unavailable";
        log("Could not render attachment " + paper.attachmentID + " in Paper Viewer: " + error);
      })
      .finally(() => {
        paper.readerJob = null;
        renderViewer(win);
      });
  }

  async function renderAttachmentInPaperViewer(win, paper) {
    const attachment = Zotero.Items.get(paper.attachmentID);
    if (!attachment) {
      throw new Error("Attachment not found");
    }

    const filePath = await attachment.getFilePathAsync?.();
    if (!filePath || !(await OS.File.exists(filePath))) {
      throw new Error("PDF file not found");
    }

    revokeReaderResources(win, paper);
    paper.readerPages = [];
    paper.readerObjectURLs = [];
    paper.readerStatus = "loading";
    paper.readerStatusText = "Reading PDF...";
    renderViewer(win);

    const pdfjsLib = await getPDFJSLib(win);
    const data = await OS.File.read(filePath);
    const loadingTask = pdfjsLib.getDocument(getPDFDocumentOptions(win, data));

    let pdf = null;
    try {
      pdf = await loadingTask.promise;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (!isPaperViewerOpen(win, paper)) {
          return;
        }
        paper.readerStatusText = "Rendering page " + pageNumber + " of " + pdf.numPages + "...";
        const renderedPage = await renderReaderPage(win, pdf, pageNumber);
        if (!isPaperViewerOpen(win, paper)) {
          try {
            win.URL.revokeObjectURL(renderedPage.url);
          }
          catch (error) {}
          return;
        }
        paper.readerPages.push(renderedPage);
        paper.readerObjectURLs.push(renderedPage.url);
        renderViewer(win);
      }

      paper.readerStatus = "ready";
      paper.readerStatusText = "PDF loaded";
    }
    finally {
      try {
        await pdf?.destroy();
      }
      catch (error) {}
    }
  }

  async function renderReaderPage(win, pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(READER_MAX_PAGE_WIDTH / baseViewport.width, READER_MAX_PAGE_SCALE);
    const viewport = page.getViewport({ scale });
    const canvas = win.document.createElementNS(HTML_NS, "canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Could not create 2D canvas context");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    const blob = await canvasToPNGBlob(canvas);
    const url = win.URL.createObjectURL(blob);
    return {
      pageNumber,
      url,
      width: canvas.width,
      height: canvas.height
    };
  }

  function isPaperViewerOpen(win, paper) {
    const state = windows.get(win);
    return Boolean(state?.overlay && state.papers.includes(paper));
  }

  function revokeReaderResources(win, paper) {
    if (!paper?.readerObjectURLs?.length) {
      return;
    }

    for (let url of paper.readerObjectURLs) {
      try {
        win.URL.revokeObjectURL(url);
      }
      catch (error) {}
    }
    paper.readerObjectURLs = [];
  }

  async function openAttachmentInBackground(win, paper) {
    if (!paper.attachmentID) {
      return;
    }

    try {
      setBackgroundOpenFeedback(win, paper, "opened");
      if (win.ZoteroPane?.viewAttachment) {
        await win.ZoteroPane.viewAttachment(paper.attachmentID);
        return;
      }
      if (Zotero.Reader?.open) {
        await Zotero.Reader.open(paper.attachmentID);
        return;
      }
      if (win.ZoteroPane_Local?.viewAttachment) {
        await win.ZoteroPane_Local.viewAttachment(paper.attachmentID);
      }
    }
    catch (error) {
      paper.backgroundOpenStatus = null;
      renderViewer(win);
      log("Could not open attachment " + paper.attachmentID + " in Zotero: " + error);
    }
  }

  function setBackgroundOpenFeedback(win, paper, status) {
    paper.backgroundOpenStatus = status;
    if (paper.backgroundOpenTimer) {
      win.clearTimeout(paper.backgroundOpenTimer);
    }
    paper.backgroundOpenTimer = win.setTimeout(() => {
      paper.backgroundOpenStatus = null;
      paper.backgroundOpenTimer = null;
      renderViewer(win);
    }, 1800);
    renderViewer(win);
  }

  function ensureStyles(doc) {
    if (doc.getElementById(STYLE_ID)) {
      return;
    }

    const style = html(doc, "style");
    style.id = STYLE_ID;
    style.textContent = `
      .pfv-overlay {
        background: #111315;
        color: #f7f1e8;
        display: flex;
        flex-direction: column;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        inset: 0;
        line-height: 1.45;
        position: fixed;
        z-index: 2147483647;
      }

      .pfv-header,
      .pfv-footer {
        align-items: center;
        display: flex;
        justify-content: space-between;
        min-height: 64px;
        padding: 0 24px;
      }

      .pfv-header {
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .pfv-footer {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        color: #9ca3af;
        font-size: 12px;
      }

      .pfv-kicker {
        color: #ffffff;
        font-size: 15px;
        font-weight: 700;
      }

      .pfv-count {
        color: #aeb7c2;
        font-size: 12px;
        margin-top: 2px;
      }

      .pfv-main {
        align-items: center;
        display: grid;
        flex: 1;
        gap: 22px;
        grid-template-columns: 56px minmax(0, 1180px) 56px;
        justify-content: center;
        min-height: 0;
        padding: 22px 24px;
      }

      .pfv-card {
        align-items: stretch;
        display: grid;
        gap: 40px;
        grid-template-columns: minmax(360px, 1fr) minmax(200px, 280px);
        min-height: 500px;
        min-width: 0;
        width: 100%;
      }

      .pfv-card-reading {
        grid-template-columns: minmax(0, 1fr) minmax(180px, 240px);
        min-height: 0;
      }

      .pfv-preview {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 0;
        display: flex;
        flex-direction: column;
        gap: 18px;
        justify-content: center;
        min-height: 520px;
        min-width: 0;
        overflow: hidden;
        padding: 0;
      }

      .pfv-preview-empty {
        color: #d1d5db;
        font-size: 18px;
        font-weight: 700;
      }

      .pfv-page-shape {
        background: #f8fafc;
        border-radius: 3px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
        height: min(58vh, 460px);
        max-height: 460px;
        max-width: 320px;
        position: relative;
        width: min(74%, 320px);
      }

      .pfv-page-shape::before,
      .pfv-page-shape::after {
        background: #d8dee8;
        content: "";
        left: 14%;
        position: absolute;
        right: 14%;
      }

      .pfv-page-shape::before {
        height: 12px;
        top: 14%;
      }

      .pfv-page-shape::after {
        box-shadow: 0 28px 0 #e5e7eb, 0 56px 0 #e5e7eb, 0 84px 0 #e5e7eb;
        height: 8px;
        top: 28%;
      }

      .pfv-page-shape-loading {
        animation: pfvPreviewPulse 1.4s ease-in-out infinite;
      }

      .pfv-thumbnail {
        background: #ffffff;
        border-radius: 3px;
        box-shadow: 0 28px 90px rgba(0, 0, 0, 0.42);
        display: block;
        max-height: min(76vh, 840px);
        max-width: min(98%, 680px);
        object-fit: contain;
      }

      .pfv-pdf-reader {
        align-self: stretch;
        background: #1a1d20;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.28);
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-height: calc(100vh - 172px);
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        overflow: auto;
        padding: 22px;
        box-sizing: border-box;
        width: 100%;
      }

      .pfv-reader-pages {
        align-items: center;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .pfv-reader-page {
        background: #ffffff;
        border-radius: 3px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.36);
        display: block;
        height: auto;
        max-width: 100%;
        min-width: 0;
      }

      .pfv-reader-message {
        align-self: center;
        color: #c7ced8;
        font-size: 13px;
        padding: 8px 0;
      }

      .pfv-preview-label {
        color: #aeb7c2;
        font-size: 13px;
        text-align: center;
      }

      @keyframes pfvPreviewPulse {
        0%,
        100% {
          opacity: 0.72;
        }

        50% {
          opacity: 1;
        }
      }

      .pfv-meta {
        align-self: center;
        justify-self: start;
        min-width: 0;
        max-width: 280px;
        width: 100%;
      }

      .pfv-paper-title {
        color: #ffffff;
        font-size: 20px;
        font-weight: 750;
        line-height: 1.18;
        margin: 0 0 12px;
        overflow-wrap: anywhere;
      }

      .pfv-creators {
        color: #d3d8de;
        font-size: 13px;
        margin-bottom: 18px;
      }

      .pfv-metadata-row {
        border-top: 1px solid rgba(255, 255, 255, 0.09);
        display: grid;
        gap: 4px;
        grid-template-columns: 1fr;
        padding: 10px 0;
      }

      .pfv-metadata-label {
        color: #8f99a5;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .pfv-metadata-value {
        color: #f4f0e8;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .pfv-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 20px;
      }

      .pfv-action-feedback {
        color: #9bd6ad;
        font-size: 12px;
        font-weight: 700;
      }

      .pfv-primary-button,
      .pfv-secondary-button,
      .pfv-icon-button,
      .pfv-nav-button {
        appearance: none;
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        font: inherit;
      }

      .pfv-primary-button {
        background: #f0b35a;
        color: #17120b;
        font-weight: 750;
        min-height: 42px;
        width: 100%;
        padding: 0 18px;
      }

      .pfv-secondary-button {
        background: rgba(255, 255, 255, 0.1);
        color: #f8fafc;
        font-weight: 700;
        min-height: 42px;
        width: 100%;
        padding: 0 16px;
      }

      .pfv-icon-button,
      .pfv-nav-button {
        align-items: center;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        display: inline-flex;
        font-weight: 800;
        justify-content: center;
      }

      .pfv-icon-button {
        height: 36px;
        width: 36px;
      }

      .pfv-nav-button {
        align-self: center;
        font-size: 24px;
        height: 56px;
        width: 56px;
      }

      .pfv-primary-button:hover,
      .pfv-secondary-button:hover,
      .pfv-icon-button:hover,
      .pfv-nav-button:hover {
        filter: brightness(1.08);
      }

      .pfv-primary-button:disabled,
      .pfv-secondary-button:disabled,
      .pfv-nav-button:disabled {
        cursor: default;
        filter: grayscale(1);
        opacity: 0.36;
      }

      @media (max-width: 760px) {
        .pfv-main {
          grid-template-columns: 44px minmax(0, 1fr) 44px;
          padding: 16px 12px;
        }

        .pfv-card {
          gap: 18px;
          grid-template-columns: 1fr;
          min-height: 0;
        }

        .pfv-card-reading {
          grid-template-columns: 1fr;
        }

        .pfv-preview {
          min-height: 300px;
          padding: 0;
        }

        .pfv-page-shape {
          height: 220px;
        }

        .pfv-thumbnail {
          max-height: 420px;
          max-width: min(98%, 340px);
        }

        .pfv-pdf-reader {
          max-height: 58vh;
          padding: 12px;
        }

        .pfv-paper-title {
          font-size: 18px;
        }

        .pfv-metadata-row {
          grid-template-columns: 1fr;
          gap: 4px;
        }
      }
    `;

    doc.documentElement.appendChild(style);
  }

  function html(doc, tag, className, text) {
    const element = doc.createElementNS(HTML_NS, tag);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function createXULElement(doc, tag) {
    if (doc.createXULElement) {
      return doc.createXULElement(tag);
    }
    return doc.createElementNS(XUL_NS, tag);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function log(message) {
    try {
      Zotero.debug("[Paper Viewer] " + message);
    }
    catch (error) {}
  }

  return {
    startup,
    shutdown,
    onMainWindowLoad,
    onMainWindowUnload
  };
})();
