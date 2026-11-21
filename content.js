(() => {
  "use strict";

  const PREFIX = "m:";
  const ID_RE = /\/movies\/(\d+)/;
  let cache = {}; // id -> { watched, rating, title, url, updated }

  const getId = (href) => {
    const m = ID_RE.exec(href || "");
    return m ? m[1] : null;
  };

  // ---------- storage ----------
  function save(id, patch) {
    const next = { watched: false, rating: null, ...(cache[id] || {}), ...patch, updated: Date.now() };
    if (!next.watched && !next.rating) {
      delete cache[id];
      chrome.storage.local.remove(PREFIX + id);
    } else {
      cache[id] = next;
      chrome.storage.local.set({ [PREFIX + id]: next });
    }
    refresh();
  }

  // ---------- titles ----------
  function tileTitle(a) {
    const img = a.querySelector("img[alt]");
    return (
      (img && img.alt.trim()) ||
      a.getAttribute("aria-label") ||
      a.textContent.trim().slice(0, 100) ||
      ""
    );
  }

  function detailTitle() {
    const h1 = document.querySelector("h1");
    const t = (h1 && h1.textContent.trim()) || document.title;
    return t.replace(/\s*[|\-–]\s*Tubi.*$/i, "").trim();
  }

  // ---------- controls ----------
  function makeButton(act, label, tip) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.act = act;
    b.textContent = label;
    b.title = tip;
    return b;
  }

  function makeControls(id, getTitle, getUrl) {
    const box = document.createElement("div");
    box.className = "tt-controls";
    box.append(
      makeButton("watched", "👁", "Toggle watched"),
      makeButton("up", "👍", "Thumbs up"),
      makeButton("down", "👎", "Thumbs down")
    );
    // Capture phase so Tubi's own link handlers never see the click.
    box.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest("button");
        if (!btn) return;
        const s = cache[id] || {};
        const act = btn.dataset.act;
        const meta = { title: getTitle(), url: getUrl() };
        if (act === "watched") save(id, { ...meta, watched: !s.watched });
        else save(id, { ...meta, rating: s.rating === act ? null : act });
      },
      true
    );
    return box;
  }

  function syncControls(box, state) {
    if (!box) return;
    const s = state || {};
    box.querySelector('[data-act="watched"]').classList.toggle("tt-on", !!s.watched);
    box.querySelector('[data-act="up"]').classList.toggle("tt-on", s.rating === "up");
    box.querySelector('[data-act="down"]').classList.toggle("tt-on", s.rating === "down");
  }

  // ---------- tiles ----------
  function processTiles() {
    document.querySelectorAll('a[href*="/movies/"]').forEach((a) => {
      const id = getId(a.getAttribute("href"));
      if (!id || !a.querySelector("img")) return;

      if (!a.querySelector(":scope > .tt-controls")) {
        if (getComputedStyle(a).position === "static") a.classList.add("tt-rel");
        a.classList.add("tt-tile");
        a.appendChild(makeControls(id, () => tileTitle(a), () => a.href));
      }

      const s = cache[id];
      a.dataset.ttId = id;
      a.classList.toggle("tt-watched", !!(s && s.watched));
      if (s && s.rating) a.dataset.ttRating = s.rating;
      else delete a.dataset.ttRating;
      syncControls(a.querySelector(":scope > .tt-controls"), s);
    });
  }

  // ---------- detail / watch page panel ----------
  function processDetailPanel() {
    const m = ID_RE.exec(location.pathname);
    let panel = document.querySelector(".tt-detail-panel");

    if (!m) {
      if (panel) panel.remove();
      return;
    }
    const id = m[1];
    if (panel && panel.dataset.ttId !== id) {
      panel.remove();
      panel = null;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "tt-detail-panel";
      panel.dataset.ttId = id;
      panel.appendChild(makeControls(id, detailTitle, () => location.href));
      document.body.appendChild(panel);
    }
    syncControls(panel.querySelector(".tt-controls"), cache[id]);
  }

  // ---------- refresh loop ----------
  let timer = null;
  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      processTiles();
      processDetailPanel();
    }, 120);
  }

  // Tubi is a single-page app: watch for new tiles and URL changes.
  new MutationObserver(refresh).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      refresh();
    }
  }, 500);

  // Keep open tabs in sync.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (!key.startsWith(PREFIX)) continue;
      const id = key.slice(PREFIX.length);
      if (newValue) cache[id] = newValue;
      else delete cache[id];
    }
    refresh();
  });

  chrome.storage.local.get(null, (items) => {
    for (const [k, v] of Object.entries(items || {})) {
      if (k.startsWith(PREFIX)) cache[k.slice(PREFIX.length)] = v;
    }
    refresh();
  });
})();
