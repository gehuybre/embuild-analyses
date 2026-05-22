import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const SOURCE_URL =
  process.env.SOURCE_URL ??
  "https://apps.energiesparen.be/energiekaart/vlaanderen/premies-res-tijdreeks-algemeen";

const OUT_DIR =
  process.env.OUT_DIR ??
  path.resolve(SCRIPT_DIR, "../data");

const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 180_000);
const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

function log(message) {
  if (!DEBUG) return;
  process.stdout.write(`[energiekaart] ${new Date().toISOString()} ${message}\n`);
}

function sanitizeFilename(input) {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} .,_-]/gu, "")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 140);
}

function sha256(textOrBuffer) {
  return crypto.createHash("sha256").update(textOrBuffer).digest("hex");
}

function parseCsvRow(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

async function ensureEmptyDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir);
  await Promise.all(
    entries
      .filter((name) => !name.startsWith("."))
      .map((name) => fs.rm(path.join(dir, name), { recursive: true, force: true })),
  );
}

async function exportTablesFromPage(page) {
  return await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms),
        ),
      ]);

    const container = document.querySelector("div[powerbi-embed]");
    if (!container) {
      throw new Error("No PowerBI container found: div[powerbi-embed]");
    }

    // Wait until embed attaches.
    for (let i = 0; i < 120; i++) {
      const report = window.powerbi?.get(container);
      if (report) break;
      await sleep(1000);
    }

    const report = window.powerbi?.get(container);
    if (!report) {
      throw new Error("PowerBI report instance not found via powerbi.get()");
    }

    let bookmarks = [];
    try {
      const bm = report.bookmarksManager;
      if (bm?.getBookmarks) {
        bookmarks = await withTimeout(
          bm.getBookmarks(),
          10_000,
          "bookmarksManager.getBookmarks()",
        );
      }
    } catch {
      // ignore
    }

    const applyBookmark = async (bookmark) => {
      const bm = report.bookmarksManager;
      if (!bookmark) return;
      if (bm?.apply && bookmark.name) {
        await withTimeout(
          bm.apply(bookmark.name),
          30_000,
          `bookmarksManager.apply(${bookmark.name})`,
        );
        return;
      }
      if (bm?.applyState && bookmark.state) {
        await withTimeout(bm.applyState(bookmark.state), 30_000, "bookmarksManager.applyState(..)");
      }
    };

    // Wait until API calls succeed.
    let pages = null;
    for (let i = 0; i < 120; i++) {
      try {
        pages = await withTimeout(report.getPages(), 10_000, "report.getPages()");
        if (pages?.length) break;
      } catch {
        // keep polling
      }
      await sleep(1000);
    }
    if (!pages?.length) {
      throw new Error("PowerBI report pages not available (timeout)");
    }

    const models =
      window.models ??
      window.powerbi?.models ??
      window["powerbi-client"]?.models ??
      null;

    const exportType =
      models?.ExportDataType?.Summarized ??
      models?.exportDataType?.summarized ??
      0;

    const skipTypes = new Set([
      "slicer",
      "textbox",
      "image",
      "shape",
      "button",
      "actionbutton",
      "qna",
    ]);
    const typeAllowlist = new Set(["pivottable", "table", "matrix"]);

    const variants = [{ name: "default", bookmark: null }];
    if (Array.isArray(bookmarks) && bookmarks.length) {
      const relevant = bookmarks.filter((b) =>
        /aantal|bedrag|premie|euro|amount|count|matrix|tabel|table/i.test(
          b?.displayName ?? b?.name ?? "",
        ),
      );
      const picked = (relevant.length ? relevant : bookmarks).slice(0, 15);
      for (const b of picked) {
        variants.push({
          name: b.displayName ?? b.name ?? "bookmark",
          bookmark: b,
        });
      }
    }

    const out = {
      bookmarks: bookmarks.map((b) => ({ name: b.name ?? null, displayName: b.displayName ?? null })),
      variants: [],
    };

    for (const variant of variants) {
      try {
        await applyBookmark(variant.bookmark);
        await sleep(1500);
      } catch {
        // ignore
      }

      const pagesOut = [];
      for (const p of pages) {
        try {
          await p.setActive();
        } catch {
          // ignore
        }

        const visuals = await withTimeout(
          p.getVisuals(),
          20_000,
          `page.getVisuals(${p.displayName ?? p.name})`,
        );

        const results = [];
        for (const visual of visuals) {
          const type = String(visual.type ?? "").toLowerCase();
          if (skipTypes.has(type)) continue;
          if (!typeAllowlist.has(type)) continue;

          const title = visual.title ?? visual.name ?? "(untitled)";

          let exported = null;
          let error = null;
          try {
            // Most powerbi-client versions accept at least (exportType).
            exported = await withTimeout(
              visual.exportData(exportType),
              90_000,
              `visual.exportData(${p.displayName ?? p.name} / ${title})`,
            );
          } catch (e) {
            error = String(e?.message ?? e);
          }

          results.push({
            name: visual.name ?? null,
            title,
            type,
            export: exported ? { data: exported.data ?? null } : null,
            error,
          });
        }

        pagesOut.push({
          page: { name: p.name ?? null, displayName: p.displayName ?? null },
          visuals: results,
        });
      }

      out.variants.push({
        name: variant.name,
        pages: pagesOut,
      });
    }

    return out;
  });
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await ensureEmptyDir(OUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    log(`Navigating to ${SOURCE_URL}`);
    await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    log("Waiting for PowerBI iframe");
    await page.waitForSelector("div[powerbi-embed] iframe", { timeout: TIMEOUT_MS });

    log("Exporting PowerBI visuals (CSV via exportData) across all report pages");
    const exported = await exportTablesFromPage(page);
    const exportedData = exported.variants.flatMap((variant) =>
      variant.pages.flatMap((p) =>
        p.visuals
          .filter((v) => !v.error && v.export?.data)
          .map((v) => ({ ...v, variant: variant.name, page: p.page })),
      ),
    );
    if (exportedData.length === 0) {
      const diagnosticsPath = path.join(OUT_DIR, "diagnostics.json");
      await fs.writeFile(
        diagnosticsPath,
        JSON.stringify(
          {
            source_url: SOURCE_URL,
            note: "No tables could be exported; see raw export output below.",
            exported,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      throw new Error(`No visuals exported any data. Diagnostics written to ${diagnosticsPath}`);
    }

    const written = [];
    const prefix = "premies-res-tijdreeks-algemeen";
    const usedFilenames = new Set();
    for (const t of exportedData) {
      const variantPart = sanitizeFilename(t.variant ?? "default");
      const pagePart = sanitizeFilename(t.page?.displayName ?? t.page?.name ?? "page");
      const base = sanitizeFilename(t.title) || sanitizeFilename(t.name) || "table";
      const type = sanitizeFilename(t.type) || "visual";
      const namePart = sanitizeFilename(t.name) || "visual";
      const csv = String(t.export.data).replace(/\r\n/g, "\n");

      const headerLine = csv.split("\n", 1)[0] ?? "";
      const headerCols = parseCsvRow(headerLine);
      const measurePart = sanitizeFilename(headerCols[headerCols.length - 1] ?? "") || "data";

      let filename = `${prefix}__${variantPart}__${pagePart}__${type}__${base}__${measurePart}.csv`;
      if (usedFilenames.has(filename)) {
        filename = `${prefix}__${variantPart}__${pagePart}__${type}__${base}__${measurePart}__${namePart}.csv`;
      }
      usedFilenames.add(filename);

      const filepath = path.join(OUT_DIR, filename);
      await fs.writeFile(filepath, csv.endsWith("\n") ? csv : `${csv}\n`, "utf8");
      written.push({
        variant: t.variant ?? null,
        page: t.page?.displayName ?? t.page?.name ?? null,
        title: t.title,
        type: t.type,
        filename,
        sha256: sha256(csv),
      });
    }

    const metadata = {
      source_url: SOURCE_URL,
      fetched_at: new Date().toISOString(),
      powerbi_bookmarks: exported.bookmarks ?? [],
      powerbi_variants: exported.variants?.map((v) => v.name) ?? [],
      powerbi_pages: Array.from(
        new Map(
          (exported.variants ?? [])
            .flatMap((v) => (v.pages ?? []).map((p) => [p.page?.name ?? p.page?.displayName, p.page]))
            .filter(([k]) => k),
        ).values(),
      ),
      files: written.sort((a, b) => a.filename.localeCompare(b.filename)),
    };
    await fs.writeFile(
      path.join(OUT_DIR, "metadata.json"),
      JSON.stringify(metadata, null, 2) + "\n",
      "utf8",
    );

    process.stdout.write(
      `Exported ${written.length} visual(s) to ${OUT_DIR} from ${SOURCE_URL}\n`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
