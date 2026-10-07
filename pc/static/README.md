# Static assets — TOUGHENING MACHINE operator GUI

Local-only assets served by the PC-side FastAPI server. No CDN,
no external resources, no Internet required.

## Files

| File | Purpose |
|---|---|
| `index.html` | Skeleton layout: header, three panels, footer. |
| `style.css` | Styles, RTL support via CSS logical properties. |
| `app.js` | Language/calendar toggles, i18n rendering. |
| `i18n/en.json` | English strings. |
| `i18n/fa.json` | Persian strings. |
| `README.md` | This file. |

## Adding a string

1. Choose a unique key (e.g. `panel.live.newField`).
2. Add it to **both** `i18n/en.json` and `i18n/fa.json` with the same key.
3. In `index.html`, add `data-i18n="panel.live.newField"` to the element.
4. Do NOT hardcode user-visible English strings in HTML.

## Adding a new language

1. Create `i18n/<lang>.json` (e.g. `i18n/ar.json`).
2. Copy all keys from `en.json`.
3. Translate values.
4. Update `app.js` language detection if the new language code
   needs special handling.

## Rules

- No inline `<script>` or `<style>`.
- No web fonts.
- No JS frameworks.
- No CDN references.
- All user-visible text comes from i18n JSON.
