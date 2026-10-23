#!/usr/bin/env node
// Zero-dependency static blog generator.
// Reads posts/*.md (front matter + Markdown), writes the site to dist/.
//   node build.js          build once
//   node build.js --serve  build and serve at http://localhost:4000
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
const SERVE = process.argv.includes("--serve");
// Path prefix from site.url (e.g. "/my-blog" for a GitHub Pages project site); empty for local preview.
const ORIGIN = new URL(site.url).origin;
const B = SERVE ? "" : new URL(site.url).pathname.replace(/\/$/, "");
const link = (u) => (u.startsWith("/") ? B + u : u);

// ---------- Markdown ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function markdown(src) {
  const lines = src.replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
    } else if (/^#{1,6}\s/.test(line)) {
      const n = line.match(/^#+/)[0].length;
      out.push(`<h${n}>${inline(line.slice(n).trim())}</h${n}>`);
      i++;
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push("<hr>");
      i++;
    } else if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdown(buf.join("\n"))}</blockquote>`);
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>`);
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.join("")}</${tag}>`);
    } else if (line.trim() === "") {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,6}\s|```|>|\s*([-*]|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${buf.map(inline).join("<br>\n")}</p>`);
    }
  }
  return out.join("\n");
}

// ---------- Content ----------
function load(file) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  if (m) for (const l of m[1].split("\n")) {
    const kv = l.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  const body = m ? m[2] : raw;
  const base = path.basename(file, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return {
    title: meta.title || base,
    date: new Date(meta.date || fs.statSync(file).mtime),
    slug: meta.slug || base,
    page: meta.page === "true",
    draft: meta.draft === "true",
    html: markdown(body),
  };
}

const all = fs.readdirSync(path.join(ROOT, "posts"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => load(path.join(ROOT, "posts", f)))
  .filter((p) => !p.draft);
const posts = all.filter((p) => !p.page).sort((a, b) => b.date - a.date);

// ---------- Templates ----------
const fmtDate = (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const url = (p) => `${B}/${p.slug}/`;

const layout = ({ title, body, description = site.description }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:site_name" content="${esc(site.title)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital@0;1&family=Oxygen:wght@300;400;700&display=swap">
<link rel="stylesheet" href="${B}/style.css">
<link rel="alternate" type="application/atom+xml" href="${B}/posts.atom" title="${esc(site.title)}">
</head>
<body>
<header id="header"><h1><a href="${B}/">${esc(site.title)}</a></h1></header>
<div id="main_container">
<div id="main">
${body}
</div>
${sidebar()}
</div>
</body>
</html>
`;

const sidebar = () => `<aside id="sidebar">
  <section id="bio">
    <h3>${esc(site.author)}</h3>
    <div class="stack">
      ${site.subscribeUrl ? `<a href="${esc(site.subscribeUrl)}">Subscribe by Email</a>` : ""}
      ${site.socialUrl ? `<a href="${esc(site.socialUrl)}">${esc(site.socialLabel || "Follow")}</a>` : ""}
    </div>
  </section>
  <section>
    <form action="${B}/archive/"><input type="search" name="q" placeholder="Search this site..."></form>
    <p><a href="${B}/archive/">Browse the Archive&nbsp;&raquo;</a></p>
  </section>
  ${site.blogroll?.length ? `<section><ul>${site.blogroll.map((b) => `<li><a href="${esc(link(b.url))}">${esc(b.label)}</a></li>`).join("")}</ul></section>` : ""}
  <section><a href="${B}/posts.atom">RSS / Atom feed</a></section>
</aside>`;

const article = (p, full) => `<article class="post">
  <header class="post-title"><h2><a href="${url(p)}">${esc(p.title)}</a></h2></header>
  <div class="post-body">${p.html}</div>
  ${p.page ? "" : `<footer><span class="display-date">Posted <a href="${url(p)}">${fmtDate(p.date)}</a></span></footer>`}
  ${full ? `<p class="back"><a href="${B}/">&laquo; Back to blog</a></p>` : ""}
</article>`;

function pagination(n, total) {
  if (total < 2) return "";
  const href = (k) => (k === 1 ? `${B}/` : `${B}/page/${k}/`);
  const items = [];
  if (n > 1) items.push(`<li><a href="${href(n - 1)}">&laquo; Prev</a></li>`);
  for (let k = 1; k <= total; k++) items.push(`<li class="${k === n ? "active" : ""}"><a href="${href(k)}">${k}</a></li>`);
  if (n < total) items.push(`<li><a href="${href(n + 1)}">Next &raquo;</a></li>`);
  return `<nav class="pagination"><ul>${items.join("")}</ul></nav>`;
}

function archive() {
  const byYear = {};
  for (const p of posts) (byYear[p.date.getUTCFullYear()] ||= []).push(p);
  const years = Object.keys(byYear).sort((a, b) => b - a);
  const list = years.map((y) => `<section class="year"><h3>${y}</h3><ul>${byYear[y].map((p) =>
    `<li data-title="${esc(p.title.toLowerCase())}"><span class="date">${p.date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span><a href="${url(p)}">${esc(p.title)}</a></li>`).join("")}</ul></section>`).join("");
  // Client-side title filter driven by ?q= from the sidebar search box.
  return `<div class="archive"><div class="post-title"><h2>Archive</h2></div>${list}
<p id="none" hidden>No results found.</p></div>
<script>
addEventListener("DOMContentLoaded", () => {
const q = new URLSearchParams(location.search).get("q");
if (!q) return;
{
  const t = q.toLowerCase(); let hits = 0;
  document.querySelector('#sidebar input').value = q;
  document.querySelectorAll('.archive li').forEach(li => { const m = li.dataset.title.includes(t); li.hidden = !m; hits += m; });
  document.querySelectorAll('.archive .year').forEach(s => s.hidden = !s.querySelector('li:not([hidden])'));
  document.getElementById('none').hidden = hits > 0;
}
});
</script>`;
}

function atom() {
  const entries = posts.slice(0, 20).map((p) => `<entry>
<title>${esc(p.title)}</title>
<link href="${ORIGIN}${url(p)}"/>
<id>${ORIGIN}${url(p)}</id>
<updated>${p.date.toISOString()}</updated>
<content type="html">${esc(p.html)}</content>
</entry>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${esc(site.title)}</title>
<link href="${site.url}/"/>
<link rel="self" href="${site.url}/posts.atom"/>
<id>${site.url}/</id>
<updated>${(posts[0]?.date || new Date()).toISOString()}</updated>
<author><name>${esc(site.author)}</name></author>
${entries}
</feed>
`;
}

// ---------- Write ----------
function write(rel, content) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, "theme"), OUT, { recursive: true });
  const per = site.postsPerPage || 10;
  const pages = Math.max(1, Math.ceil(posts.length / per));
  for (let n = 1; n <= pages; n++) {
    const body = posts.slice((n - 1) * per, n * per).map((p) => article(p, false)).join("\n") + pagination(n, pages);
    write(n === 1 ? "index.html" : `page/${n}/index.html`, layout({ title: site.title, body }));
  }
  for (const p of all) write(`${p.slug}/index.html`, layout({ title: `${p.title} - ${site.title}`, body: article(p, true) }));
  write("archive/index.html", layout({ title: `Archive - ${site.title}`, body: archive() }));
  write("posts.atom", atom());
  console.log(`Built ${posts.length} posts, ${all.length - posts.length} pages -> dist/`);
}

build();

if (SERVE) {
  const http = require("http");
  const types = { ".html": "text/html", ".css": "text/css", ".atom": "application/atom+xml", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
  http.createServer((req, res) => {
    let f = path.join(OUT, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(OUT)) return res.writeHead(403).end();
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) return res.writeHead(404).end("Not found");
    res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  }).listen(4000, () => console.log("Serving at http://localhost:4000"));
}
