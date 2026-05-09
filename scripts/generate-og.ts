// Generates public/og.png for social-media link previews.
//
// HEADS-UP: this is a hand-rolled facsimile of <Card>. The HTML/CSS below
// mirrors src/cards/Card.module.css (and uses the same --print-color-* values
// from src/index.css) but does NOT import any of it. Running in node +
// Playwright via setContent() avoids the dev-server / Supabase auth /
// route-mocking dance, but means the OG card will drift if the print tokens
// move or if Card's structure changes. When you redesign cards, eyeball this
// against the running <Card> and update inline values to match.
//
// What's faithful to a real card: print-token colors (#fff paper, #111 ink,
// #555/#666 muted ink, #ddd/#222 borders), header tags + footer tags shape
// derived as spellDetailToCard() would (4 header tags joined by " | "; V/S/M
// + classes in the footer), and body text via the project's
// `***At Higher Levels.***` formatter from src/api/mappers/spells.ts.
// What's stylized for OG: card width is 320px (instead of the real 3.75in
// print size), title/tag fonts are scaled up for hero-shot legibility, and
// one descriptive clause was removed from the body for layout fit. Card body
// text otherwise comes verbatim from data/srd-2024-spells.raw.json -> Fireball.
//
// Run: npx tsx scripts/generate-og.ts (or `npm run gen:og`).

import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IconifyJSON } from "@iconify/types";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, "../public/og.png");

const require = createRequire(import.meta.url);
const collection: IconifyJSON = JSON.parse(
  readFileSync(require.resolve("@iconify-json/game-icons/icons.json"), "utf8"),
);
const fireballIcon = collection.icons.fireball;
if (!fireballIcon) throw new Error("fireball icon missing from @iconify-json/game-icons");
const iconW = fireballIcon.width ?? collection.width ?? 64;
const iconH = fireballIcon.height ?? collection.height ?? 64;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${iconW} ${iconH}" fill="currentColor">${fireballIcon.body}</svg>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 1200px;
    height: 630px;
    overflow: hidden;
  }
  .canvas {
    width: 1200px;
    height: 630px;
    background: #faf7f2;
    background-image: radial-gradient(circle, #e8dcc4 1px, transparent 1.5px);
    background-size: 24px 24px;
    display: flex;
    align-items: center;
    padding: 0 80px 0 90px;
    box-sizing: border-box;
    gap: 70px;
    font-family: Georgia, "Times New Roman", serif;
  }
  .card-wrap {
    flex: 0 0 320px;
    transform: rotate(-3deg);
    filter: drop-shadow(0 18px 30px rgba(26, 20, 16, 0.18));
  }
  .card {
    width: 320px;
    height: 440px;
    padding: 24px;
    box-sizing: border-box;
    background: #fff;
    color: #111;
    border: 2px solid #222;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card .header { display: flow-root; flex-shrink: 0; }
  .card .icon {
    float: right;
    margin: 0 0 -2px 8px;
    width: 60px;
    height: 60px;
    color: #111;
    position: relative;
  }
  .card .icon-frame {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .card .icon-glyph {
    position: absolute;
    inset: 20%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card .icon-glyph svg { width: 100%; height: 100%; display: block; }
  .card .title {
    margin: 0 0 4px;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.15;
  }
  .card .header-tags {
    display: block;
    font-size: 14px;
    color: #555;
    line-height: 1.25;
  }
  .card .header-tag { font-style: italic; }
  .card .header-tag + .header-tag::before {
    content: " | ";
    white-space: pre;
    font-style: normal;
  }
  .card .divider {
    border: 0;
    border-top: 1px solid #ddd;
    margin: 12px 0;
  }
  .card .body {
    font-size: 13px;
    line-height: 1.4;
    color: #111;
    flex: 1;
    overflow: hidden;
  }
  .card .body p { margin: 0 0 8px; }
  .card .body p:last-child { margin-bottom: 0; }
  .card .footer {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #ddd;
    font-size: 12px;
    color: #666;
    flex-shrink: 0;
  }
  .card .footer-tag + .footer-tag::before {
    content: " | ";
    white-space: pre;
  }

  .text { flex: 1; color: #1a1410; }
  .text h1 {
    margin: 0 0 14px;
    font-size: 64px;
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.01em;
  }
  .text .tagline {
    margin: 0 0 32px;
    font-size: 26px;
    font-style: italic;
    color: #6a5a45;
    line-height: 1.3;
  }
  .text ul {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 22px;
    line-height: 1.5;
  }
  .text li { padding-left: 20px; position: relative; }
  .text li + li { margin-top: 6px; }
  .text li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.55em;
    width: 7px;
    height: 7px;
    background: #7a3530;
    border-radius: 50%;
  }
</style>
</head>
<body>
<div class="canvas">
  <div class="card-wrap">
    <div class="card">
      <div class="header">
        <div class="icon">
          <svg class="icon-frame" viewBox="0 0 100 100">
            <polygon points="20,8 80,8 96,50 80,92 20,92 4,50" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
          </svg>
          <div class="icon-glyph">${iconSvg}</div>
        </div>
        <h3 class="title">Fireball</h3>
        <span class="header-tags"><span class="header-tag">3rd-level evocation</span><span class="header-tag">1 action</span><span class="header-tag">150 feet</span><span class="header-tag">Instantaneous</span></span>
      </div>
      <hr class="divider" />
      <div class="body">
        <p>A bright streak flashes from you to a point you choose within range. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking <strong>8d6 Fire damage</strong> on a failed save or half as much damage on a successful one. Flammable objects in the area that aren't being worn or carried start burning.</p>
        <p><strong><em>At Higher Levels.</em></strong> The damage increases by 1d6 for each spell slot level above 3.</p>
      </div>
      <div class="footer">
        <span class="footer-tag">V, S, M</span><span class="footer-tag">Sorcerer, Wizard</span>
      </div>
    </div>
  </div>
  <div class="text">
    <h1>Readable D&amp;D Cards</h1>
    <p class="tagline">Browse magic items and spells. Print clean cards for your table.</p>
    <ul>
      <li>Includes the open 5.1 and 5.2 content</li>
      <li>Edit, paginate, and print 2 or 4 per page</li>
    </ul>
  </div>
</div>
</body>
</html>`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.setContent(html, { waitUntil: "load" });
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log(`Wrote ${out}`);
