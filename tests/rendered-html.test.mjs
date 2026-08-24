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

test("admin requests support safe bulk approval alongside individual review", async () => {
  const [dashboard, approval] = await Promise.all([
    readFile(new URL("../components/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/approve-part-request.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /Select all pending/);
  assert.match(dashboard, /Bulk approve/);
  assert.match(dashboard, /admin\/requests/);
  assert.match(approval, /find_similar_parts/);
  assert.match(approval, /Possible duplicate requires individual review/);
  assert.match(approval, /from\("request_images"\)/);
});

test("part category assignment uses checkbox controls", async () => {
  const source = await readFile(new URL("../components/category-checkboxes.tsx", import.meta.url), "utf8");

  assert.match(source, /type="checkbox"/);
  assert.match(source, /checked=\{selectedIds\.includes\(category\.id\)\}/);
  assert.doesNotMatch(source, /<select multiple/);
});

test("consider ordering relationships use searchable grouped checkboxes", async () => {
  const selector = await readFile(new URL("../components/ordering-group-selector.tsx", import.meta.url), "utf8");
  const requestEditor = await readFile(new URL("../components/admin-request-editor.tsx", import.meta.url), "utf8");
  const partEditor = await readFile(new URL("../components/admin-part-editor.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20260824100000_ordering_groups_v070.sql", import.meta.url), "utf8");

  assert.match(selector, /type="checkbox"/);
  assert.match(selector, /Search compatible parts/);
  assert.match(selector, /groupMemberIds/);
  assert.match(requestEditor, /set_part_order_group/);
  assert.match(partEditor, /set_part_order_group/);
  assert.match(migration, /create table public\.part_order_groups/);
  assert.match(migration, /drop table public\.commonly_ordered_parts/);
});

test("BOM cart persists locally and exports ordering information", async () => {
  const [store, cart, shell, dashboard, details] = await Promise.all([
    readFile(new URL("../lib/bom-cart.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/bom-cart-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/parts-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/part-details.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(store, /localStorage/);
  assert.match(store, /quantity/);
  assert.match(cart, /Export CSV/);
  assert.match(cart, /Preferred supplier/);
  assert.match(cart, /Compatible machines/);
  assert.match(shell, /href="\/bom"/);
  assert.match(dashboard, /<AddToBomButton/);
  assert.match(details, /<AddToBomButton/);
});

test("parts search restores session filters and scroll position", async () => {
  const source = await readFile(new URL("../components/parts-dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /sessionStorage/);
  assert.match(source, /manufacturerId/);
  assert.match(source, /machineId/);
  assert.match(source, /supplyType/);
  assert.match(source, /categoryId/);
  assert.match(source, /scrollY/);
  assert.match(source, /onClick=\{rememberScroll\}/);
  assert.match(source, /removeItem\(SEARCH_SESSION_KEY\)/);
});

test("main machine selection supports search before manufacturer selection", async () => {
  const [selector, requestForm, adminEditor] = await Promise.all([
    readFile(new URL("../components/machine-search-select.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/part-request-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/admin-request-editor.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(selector, /Type to search machine name/);
  assert.match(selector, /machine\.manufacturer\?\.name/);
  assert.match(requestForm, /<MachineSearchSelect/);
  assert.match(requestForm, /setMachineManufacturerId\(machine\.manufacturer\?\.id/);
  assert.match(adminEditor, /<MachineSearchSelect/);
  assert.match(adminEditor, /setMachineManufacturerId\(machine\.manufacturer\?\.id/);
});
