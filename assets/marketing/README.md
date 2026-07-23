# Marketing assets

Blueprint figures generated from the app's real guide art by the **figgen** figure-export tool.
These are **not linked from the site** — they seed the marketing asset library (Play listing,
social, thumbnails). Each is a frozen guide moment: the exact layer arrangement, `.hl` glow,
and step marker the app renders for that family + step, wrapped in the site's blueprint panel.

**This same tool generates the Play Store listing screenshots when the listing is built**
(the `--size play` 1080×1920 and `--size wide` 1920×1080 presets).

| file | family / step | notes |
|---|---|---|
| `revda_step1_site.png` | double-action revolver — swing out the cylinder | site panel |
| `ar15_step4_site.png`  | AR-pattern — pivot the upper open | site panel (also shipped as FIG. 3) |
| `cfsup_step3_site.png` | suppressor — slide the baffle stack out | site panel |
| `g19_step12_site.png`  | Glock 19 — DC4 breech-face inset | site panel |
| `g19_step7_play.png`   | Glock 19 — remove the barrel | **1080×1920** Play-listing size sample |
| `ar15_step4_wide.png`  | AR-pattern — pivot the upper open | **1920×1080** 16:9 thumbnail sample |

Regenerate / add figures with the tool (in the app repo, reads `www/index.html` read-only):
`scratchpad/site/figgen/` — see its `README.md` for usage.
