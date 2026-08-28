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

test("reference companies use one searchable full editor", async () => {
  const [manager, editor, route] = await Promise.all([
    readFile(new URL("../components/reference-data-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/company-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/companies/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(manager, /href="\/admin\/companies">Company editor/);
  assert.match(manager, /Search companies/);
  assert.doesNotMatch(manager, /renameReference\("companies"/);
  assert.match(editor, /Company roles/);
  assert.match(editor, /Ordering information/);
  assert.match(editor, /Save company/);
  assert.match(route, /<CompanyEditor\/>/);
});

test("reference data modules collapse into expandable headers", async () => {
  const manager = await readFile(new URL("../components/reference-data-manager.tsx", import.meta.url), "utf8");
  assert.match(manager, /const \[expanded, setExpanded\] = useState\(false\)/);
  assert.match(manager, /aria-expanded=\{expanded\}/);
  assert.match(manager, /<ChevronIcon\/>/);
  assert.match(manager, /expanded && <div className="reference-card-content">/);
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
  assert.match(details, /related\.map\(\(item\).*<AddToBomButton partId=\{item\.id\} compact\/>/);
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

test("dashboard hides unfiltered lists and summarises compatible machines", async () => {
  const source = await readFile(new URL("../components/parts-dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /disabled=\{!manufacturerIdsWithParts\.has\(manufacturer\.id\)\}/);
  assert.match(source, /disabled=\{!machineIdsWithParts\.has\(machine\.id\)\}/);
  assert.match(source, /<span>Compatible machines<\/span>/);
  assert.match(source, /linkedMachines\.slice\(0, 2\)/);
  assert.match(source, /approved parts available to look up/);
  assert.match(source, /machines available to look up/);
  assert.match(source, /hasPartLookup/);
  assert.match(source, /hasMachineLookup/);
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

test("machine profiles expose direct editing to administrators", async () => {
  const [details, manager] = await Promise.all([
    readFile(new URL("../components/machine-details.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/machine-manager.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(details, /profile\.role === "admin"/);
  assert.match(details, /admin\/machines\?edit=/);
  assert.match(manager, /URLSearchParams\(window\.location\.search\)/);
  assert.match(manager, /setEditing\(requestedMachine\)/);
});

test("Add Part auto-fills the first supplier without overriding manual edits", async () => {
  const source = await readFile(new URL("../components/part-request-form.tsx", import.meta.url), "utf8");
  assert.match(source, /supplierAutoFill/);
  assert.match(source, /updatePartManufacturer/);
  assert.match(source, /supplier_id: company\?\.id/);
  assert.match(source, /updateManufacturerPartNumber/);
  assert.match(source, /supplier_part_number: value/);
  assert.match(source, /supplierAutoFill\.current\.company = false/);
  assert.match(source, /supplierAutoFill\.current\.partNumber = false/);
});

test("part information exposes copy controls for description and part number", async () => {
  const [details, icons] = await Promise.all([
    readFile(new URL("../components/part-details.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/icons.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(details, /<dt>Part Description<\/dt>/);
  assert.match(details, /Copy part description/);
  assert.match(details, /Copy manufacturer part number/);
  assert.match(details, /navigator\.clipboard\.writeText/);
  assert.match(icons, /export const CopyIcon/);
});


test("portable backups include images, revisions and checksum preflight", async () => {
  const source = await readFile(new URL("../components/backup-manager.tsx", import.meta.url), "utf8");
  assert.match(source, /Portable ZIP v4/);
  assert.match(source, /format_version: 4/);
  assert.match(source, /machine-images/);
  assert.match(source, /part-images/);
  assert.match(source, /request-images/);
  assert.match(source, /checksums\.sha256/);
  assert.match(source, /SHA-256/);
  assert.match(source, /Checksum failed/);
  assert.match(source, /Stored image is missing/);
  assert.match(source, /Missing user references are assigned/);
  assert.match(source, /Authentication accounts, passwords and server secrets are deliberately excluded/);
});


test("standby mode is visible and blocks editing in the frontend and database", async () => {
  const [shell, dashboard, backup, migration] = await Promise.all([
    readFile(new URL("../components/app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/backup-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260825160000_standby_read_only_mode.sql", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /Standby — read only/);
  assert.match(shell, /ENABLE EDITING/);
  assert.match(shell, /standbyBlockedPaths/);
  assert.match(dashboard, /Server mode:/);
  assert.match(dashboard, /SET STANDBY/);
  assert.match(dashboard, /SET LIVE/);
  assert.match(backup, /siteMode === "standby"/);
  assert.match(backup, /changeSiteMode\("standby"\)/);
  assert.match(migration, /create or replace function public\.is_write_enabled/);
  assert.match(migration, /create or replace function public\.set_site_mode/);
  assert.match(migration, /as restrictive for insert/);
  assert.match(migration, /standby_storage_update/);
  assert.match(migration, /database_revision', '0\.8\.0'/);
});
