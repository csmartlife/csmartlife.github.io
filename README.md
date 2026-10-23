# My Blog

A minimal static blog modeled on the structure of blog.samaltman.com (a Posthaven theme). No dependencies, just Node.

## Write
Add a file to `posts/`, e.g. `posts/2026-11-01-my-post.md`:

```
---
title: My post
date: 2026-11-01
---
Markdown here.
```

Optional front matter: `slug: custom-url`, `draft: true`, `page: true` (standalone page, hidden from lists).

## Build / preview
- `node build.js --serve` builds and serves at http://localhost:4000
- `node build.js` builds into `dist/`

## Configure
Edit `site.json` (name, URL, subscribe link, social link, sidebar links). Styling is in `theme/style.css`.

## Publish
Upload `dist/` to any static host: GitHub Pages, Netlify, Cloudflare Pages, or Vercel.
Build command `node build.js`, output directory `dist`.
