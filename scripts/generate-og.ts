// Generates public/og.png for social-media link previews.
//
// HEADS-UP: this is a hand-rolled facsimile of <Card>. The HTML/CSS below
// mirrors src/cards/Card.module.css visually but does NOT import it — running
// in node + Playwright via setContent() avoids the dev-server / Supabase
// auth / route-mocking dance, but means the OG card will drift if Card's
// styling changes (border, divider, typography, spacing, footer layout) or if
// the design tokens move. When you redesign cards, eyeball this against the
// current <Card> output and update the inline CSS to match. Card body text
// is verbatim 2024 SRD (data/srd-2024-spells.raw.json -> Fireball).
//
// Run: npx tsx scripts/generate-og.ts

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import iconFireball from "@iconify-icons/game-icons/fireball";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, "../public/og.png");

const iconWidth = iconFireball.width ?? 512;
const iconHeight = iconFireball.height ?? 512;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${iconWidth} ${iconHeight}" fill="currentColor">${iconFireball.body}</svg>`;

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
    background: #fffdf8;
    color: #1a1410;
    border: 2px solid #b8a888;
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
    color: #1a1410;
  }
  .card .icon svg { width: 100%; height: 100%; display: block; }
  .card .title {
    margin: 0 0 4px;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.15;
  }
  .card .header-tags {
    display: block;
    font-size: 15px;
    font-style: italic;
    color: #6a5a45;
    line-height: 1.2;
  }
  .card .divider {
    border: 0;
    border-top: 1px solid #d9cfc1;
    margin: 14px 0;
  }
  .card .body {
    font-size: 14px;
    line-height: 1.4;
    color: #1a1410;
    flex: 1;
    overflow: hidden;
  }
  .card .body p { margin: 0 0 10px; }
  .card .body p:last-child { margin-bottom: 0; }
  .card .body em { font-style: italic; }
  .card .footer {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #d9cfc1;
    font-size: 13px;
    color: #8a7a65;
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .card .footer-right { margin-left: auto; }

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
        <div class="icon">${iconSvg}</div>
        <h3 class="title">Fireball</h3>
        <span class="header-tags">3rd-level evocation</span>
      </div>
      <hr class="divider" />
      <div class="body">
        <p>A bright streak flashes from you to a point you choose within range. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking <strong>8d6 Fire damage</strong> on a failed save or half as much damage on a successful one. Flammable objects in the area that aren't being worn or carried start burning.</p>
        <p><strong><em>At Higher Levels.</em></strong> The damage increases by 1d6 for each spell slot level above 3.</p>
      </div>
      <div class="footer">
        <span>150 ft. range</span>
      </div>
    </div>
  </div>
  <div class="text">
    <h1>Readable D&amp;D Cards</h1>
    <p class="tagline">Browse the SRD. Print clean cards for your table.</p>
    <ul>
      <li>Magic items + spells from the 5.1 / 5.2 SRD</li>
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
