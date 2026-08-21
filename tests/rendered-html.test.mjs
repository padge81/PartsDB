import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("parts search retains the part-category filter relationships", async () => {
  const source = await readFile(new URL("../components/parts-dashboard.tsx", import.meta.url), "utf8");

  assert.match(source, /from\("categories"\)/);
  assert.match(source, /from\("part_categories"\)/);
  assert.match(source, /matchesCategory/);
  assert.match(source, /<label>Category<select value=\{categoryId\}/);
});

test("part create, approval and edit retain category assignment", async () => {
  const sources = await Promise.all([
    "part-request-form.tsx",
    "admin-request-editor.tsx",
    "admin-part-editor.tsx",
  ].map((file) => readFile(new URL(`../components/${file}`, import.meta.url), "utf8")));

  for (const source of sources) assert.match(source, /<CategoryCheckboxes/);
  assert.match(sources[0], /category_ids: categoryIds/);
  assert.match(sources[1], /from\("part_categories"\)\.insert/);
  assert.match(sources[2], /from\("part_categories"\)\.delete/);
});

test("part category assignment uses checkbox controls", async () => {
  const source = await readFile(new URL("../components/category-checkboxes.tsx", import.meta.url), "utf8");

  assert.match(source, /type="checkbox"/);
  assert.match(source, /checked=\{selectedIds\.includes\(category\.id\)\}/);
  assert.doesNotMatch(source, /<select multiple/);
});
