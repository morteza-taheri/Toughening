# Local fonts

The GUI loads **Vazirmatn** from this folder only. Nothing is fetched from the Internet.

The font file is **not** in the repository yet: the build sandbox had no Internet
access, so it could not be downloaded. Until it is added, the GUI falls back to
Segoe UI / Tahoma and the Settings page shows a notice.

## How to add it (on the development PC, once)

1. Download the Vazirmatn release (licence: SIL Open Font License 1.1) from the
   Vazirmatn project page.
2. Copy `fonts/webfonts/Vazirmatn[wght].woff2` into this folder, keeping the
   exact file name `Vazirmatn[wght].woff2`.
3. Copy `OFL.txt` from the release into this folder as well (licence requirement).
4. Reload the page (Ctrl+F5).

The offline installer must bundle this folder so the target PC never needs the Internet.