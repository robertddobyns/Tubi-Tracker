const PREFIX = "m:";
const $ = (id) => document.getElementById(id);

async function load() {
  const items = await chrome.storage.local.get(null);
  return Object.entries(items)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([k, v]) => ({ id: k.slice(PREFIX.length), ...v }));
}

function row(m) {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = m.url || `https://tubitv.com/movies/${m.id}`;
  a.target = "_blank";
  a.textContent = m.title || `Movie ${m.id}`;
  a.title = a.textContent;

  const icons = document.createElement("span");
  icons.textContent = (m.watched ? "👁" : "") + (m.rating === "up" ? "👍" : m.rating === "down" ? "👎" : "");

  const del = document.createElement("button");
  del.textContent = "✕";
  del.title = "Remove from tracker";
  del.onclick = async () => {
    await chrome.storage.local.remove(PREFIX + m.id);
    render();
  };

  li.append(a, icons, del);
  return li;
}

async function render() {
  const all = await load();
  const f = $("filter").value;
  const rows = all
    .filter(
      (m) =>
        f === "all" ||
        (f === "watched" && m.watched) ||
        (f === "up" && m.rating === "up") ||
        (f === "down" && m.rating === "down")
    )
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));

  const up = all.filter((m) => m.rating === "up").length;
  const down = all.filter((m) => m.rating === "down").length;
  $("stats").textContent = `${all.filter((m) => m.watched).length} watched · ${up} 👍 · ${down} 👎`;

  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing here yet.";
    $("list").replaceChildren(li);
  } else {
    $("list").replaceChildren(...rows.map(row));
  }
}

$("filter").onchange = render;

$("export").onclick = async () => {
  const blob = new Blob([JSON.stringify(await load(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tubi-tracker-backup.json";
  a.click();
};

$("import").onclick = () => $("file").click();
$("file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error("bad format");
    const out = {};
    for (const m of data) {
      if (!m || !/^\d+$/.test(String(m.id))) continue;
      const { id, ...rest } = m;
      out[PREFIX + id] = rest;
    }
    await chrome.storage.local.set(out);
  } catch (err) {
    alert("Import failed: not a valid backup file.");
  }
  e.target.value = "";
  render();
};

render();
