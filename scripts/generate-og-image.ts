#!/usr/bin/env bun
/**
 * Generate OG image by screenshotting the landing page
 * Uses Playwright to capture the "What is this?" section
 *
 * Usage: bun scripts/generate-og-image.ts
 */

import { chromium } from "playwright";
import { join } from "path";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

async function generateOgImage() {
  console.log("Launching browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set viewport to OG image dimensions
  await page.setViewportSize({ width: OG_WIDTH, height: OG_HEIGHT });

  // Load the local HTML file
  const htmlPath = join(import.meta.dir, "../web/index.html");
  console.log(`Loading ${htmlPath}...`);
  await page.goto(`file://${htmlPath}`);

  // Wait for fonts to load
  await page.waitForTimeout(1000);

  // Hide elements we don't want in the OG image - show ONLY the "What is this?" section
  await page.addStyleTag({
    content: `
      /* Hide everything */
      header,
      .warning-tape,
      .marquee,
      .stats,
      .ascii-art,
      footer,
      section[data-label="[ INSTALLATION ]"],
      section[data-label="[ HOW TO STAB ]"],
      section[data-label="[ FEATURES ]"],
      section[data-label="[ CLI FLAGS ]"] {
        display: none !important;
      }

      /* Center the section */
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 0;
        margin: 0;
      }

      .container {
        padding: 2.5rem 4rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      section[data-label="[ WHAT IS THIS? ]"] {
        margin: 0;
        padding: 2.5rem 3rem;
        border-width: 3px;
        max-width: 1100px;
      }

      section[data-label="[ WHAT IS THIS? ]"]::before {
        font-size: 1.1rem;
        top: -14px;
      }

      section[data-label="[ WHAT IS THIS? ]"] h2 {
        font-size: 2.2rem;
        margin-bottom: 0.8rem;
      }

      section[data-label="[ WHAT IS THIS? ]"] p {
        font-size: 1.15rem;
        line-height: 1.5;
      }

      .usage-example {
        margin: 1.2rem 0;
      }

      .terminal-body {
        padding: 1.2rem 1.5rem;
        font-size: 1rem;
        line-height: 1.6;
      }

      /* Disable animations for clean screenshot */
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }

      .noise {
        display: none;
      }

      .skull {
        display: inline-block;
      }
    `,
  });

  // Wait a bit for styles to apply
  await page.waitForTimeout(500);

  // Take screenshot
  const outputPath = join(import.meta.dir, "../web/og-image.png");
  console.log(`Taking screenshot...`);
  await page.screenshot({
    path: outputPath,
    type: "png",
  });

  await browser.close();
  console.log(`OG image saved to ${outputPath}`);
}

generateOgImage().catch(console.error);
