"use client";

import { useState, type ChangeEvent } from "react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { AppShell, type ChangeSiteMode, type SiteMode } from "./app-shell";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { APP_REVISION } from "../lib/version";

type BackupTable = { name: string; deleteColumn: string };
type Row = Record<string, unknown>;
type DatabaseBackup = { format: "PartsDB backup"; version: 4; exported_at: string; tables: Record<string, Row[]> };
type PortableManifest = {
  format: "PartsDB portable backup";
  format_version: 4;
  created_at: string;
  source: { application_revision: string; database_revision: string; supabase_url: string };
  tables: Record<string, number>;
  storage: Record<string, number>;
  complete: true;
};
type ValidatedBackup = { database: DatabaseBackup; manifest: PortableManifest; entries: Record<string, Uint8Array>; imageCount: number };

const importOrder: BackupTable[] = [
  { name: "supply_types", deleteColumn: "id" }, { name: "companies", deleteColumn: "id" }, { name: "company_roles", deleteColumn: "company_id" },
  { name: "machine_categories", deleteColumn: "id" }, { name: "machines", deleteColumn: "id" }, { name: "categories", deleteColumn: "id" },
  { name: "parts", deleteColumn: "id" }, { name: "part_requests", deleteColumn: "id" }, { name: "part_suppliers", deleteColumn: "part_id" },
  { name: "part_machines", deleteColumn: "part_id" }, { name: "part_categories", deleteColumn: "part_id" },
  { name: "part_order_groups", deleteColumn: "id" }, { name: "part_order_group_members", deleteColumn: "part_id" },
  { name: "machine_images", deleteColumn: "machine_id" }, { name: "part_images", deleteColumn: "id" }, { name: "request_images", deleteColumn: "id" },
];
const imageTableNames = ["machine_images", "part_images", "request_images"];
const allowedBuckets = new Set(["machine-images", "part-images", "request-images"]);
const imageTables = new Set(imageTableNames);
const dataTables = importOrder.filter((table) => !imageTables.has(table.name));
const deleteOrder = [...importOrder].reverse();
const DATABASE_REVISION = "0.7.0";
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const userColumns: Record<string, string[]> = {
  parts: ["created_by", "updated_by"], part_requests: ["requested_by", "reviewed_by"],
  part_order_groups: ["created_by"], part_order_group_members: ["added_by"],
  machine_images: ["uploaded_by"], part_images: ["uploaded_by"], request_images: ["uploaded_by"],
};

function safeObjectPath(bucket: string, objectPath: string) {
  if (!allowedBuckets.has(bucket) || !objectPath || objectPath.startsWith("/") || objectPath.includes("\\") || objectPath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe storage path: ${bucket}/${objectPath}`);
  }
  return `images/${bucket}/${objectPath}`;
}

function parseJson<T>(bytes: Uint8Array, label: string): T {
  try { return JSON.parse(strFromU8(bytes)) as T; }
  catch { throw new Error(`${label} is not valid JSON.`); }
}

async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function checksumFile(entries: Record<string, Uint8Array>) {
  const lines: string[] = [];
  for (const name of Object.keys(entries).sort()) lines.push(`${await sha256(entries[name])}  ${name}`);
  return `${lines.join("\n")}\n`;
}

function downloadFile(bytes: Uint8Array, fileName: string, type: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}

async function validateArchive(file: File): Promise<ValidatedBackup> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("Backup exceeds the 1 GB browser restore limit.");
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const names = Object.keys(entries);
  if (Object.values(entries).reduce((total, bytes) => total + bytes.byteLength, 0) > MAX_ARCHIVE_BYTES) throw new Error("Expanded backup exceeds the 1 GB browser restore limit.");
  for (const name of names) if (name.startsWith("/") || name.includes("\\") || name.split("/").some((part) => part === ".." || part === ".")) throw new Error(`Unsafe ZIP entry: ${name}`);
  for (const required of ["manifest.json", "database.json", "report.json", "checksums.sha256"]) if (!entries[required]) throw new Error(`Backup is missing ${required}.`);
  const manifest = parseJson<PortableManifest>(entries["manifest.json"], "manifest.json");
  const database = parseJson<DatabaseBackup>(entries["database.json"], "database.json");
  if (manifest.format !== "PartsDB portable backup" || manifest.format_version !== 4 || manifest.complete !== true) throw new Error("This is not a complete PartsDB portable backup version 4.");
  if (database.format !== "PartsDB backup" || database.version !== 4 || !database.tables || typeof database.tables !== "object") throw new Error("database.json is not PartsDB backup version 4.");
  for (const table of importOrder) if (!Array.isArray(database.tables[table.name] ?? [])) throw new Error(`Invalid ${table.name} data.`);
  for (const table of importOrder) if ((manifest.tables[table.name] ?? 0) !== (database.tables[table.name] ?? []).length) throw new Error(`Manifest record count does not match ${table.name}.`);

  const expected = new Map<string, string>();
  for (const line of strFromU8(entries["checksums.sha256"]).trim().split("\n")) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match || expected.has(match[2])) throw new Error("checksums.sha256 is malformed or contains duplicate paths.");
    expected.set(match[2], match[1]);
  }
  const payloadNames = names.filter((name) => name !== "checksums.sha256").sort();
  if (expected.size !== payloadNames.length || payloadNames.some((name) => !expected.has(name))) throw new Error("The checksum manifest does not cover every ZIP entry.");
  for (const name of payloadNames) if (await sha256(entries[name]) !== expected.get(name)) throw new Error(`Checksum failed for ${name}.`);

  let imageCount = 0;
  const storageCounts: Record<string, number> = {};
  for (const tableName of imageTableNames) for (const row of database.tables[tableName] ?? []) {
    const bucket = typeof row.storage_bucket === "string" ? row.storage_bucket : "";
    const objectPath = typeof row.storage_path === "string" ? row.storage_path : "";
    const archivePath = safeObjectPath(bucket, objectPath);
    if (!entries[archivePath]) throw new Error(`Stored image is missing: ${bucket}/${objectPath}`);
    storageCounts[bucket] = (storageCounts[bucket] ?? 0) + 1;
    imageCount += 1;
  }
  for (const bucket of allowedBuckets) if ((manifest.storage[bucket] ?? 0) !== (storageCounts[bucket] ?? 0)) throw new Error(`Manifest image count does not match ${bucket}.`);
  return { database, manifest, entries, imageCount };
}

export function BackupManager() {
  const [backup, setBackup] = useState<ValidatedBackup | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"merge" | "restore">("merge");
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function exportBackup() {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setWorking(true); setMessage("Reading database records…"); setIsError(false);
    try {
      const tables: DatabaseBackup["tables"] = {};
      for (const table of importOrder) {
        const { data, error } = await supabase.from(table.name).select("*");
        if (error) throw new Error(`Export stopped at ${table.name}: ${error.message}`);
        tables[table.name] = (data ?? []) as Row[];
      }
      const createdAt = new Date().toISOString();
      const entries: Record<string, Uint8Array> = {};
      const seenObjects = new Set<string>();
      const storageCounts: Record<string, number> = {};
      for (const tableName of imageTableNames) for (const row of tables[tableName] ?? []) {
        const bucket = typeof row.storage_bucket === "string" ? row.storage_bucket : "";
        const objectPath = typeof row.storage_path === "string" ? row.storage_path : "";
        const archivePath = safeObjectPath(bucket, objectPath);
        if (seenObjects.has(archivePath)) throw new Error(`Duplicate stored image reference: ${bucket}/${objectPath}`);
        seenObjects.add(archivePath); setMessage(`Downloading image ${seenObjects.size}…`);
        const { data, error } = await supabase.storage.from(bucket).download(objectPath);
        if (error || !data) throw new Error(`Could not download ${bucket}/${objectPath}: ${error?.message ?? "empty response"}`);
        entries[archivePath] = new Uint8Array(await data.arrayBuffer());
        storageCounts[bucket] = (storageCounts[bucket] ?? 0) + 1;
      }
      const database: DatabaseBackup = { format: "PartsDB backup", version: 4, exported_at: createdAt, tables };
      const manifest: PortableManifest = {
        format: "PartsDB portable backup", format_version: 4, created_at: createdAt,
        source: { application_revision: APP_REVISION, database_revision: DATABASE_REVISION, supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "configured project" },
        tables: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])), storage: storageCounts, complete: true,
      };
      entries["database.json"] = strToU8(JSON.stringify(database, null, 2));
      entries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
      entries["report.json"] = strToU8(JSON.stringify({ status: "complete", records: Object.values(tables).reduce((total, rows) => total + rows.length, 0), images: seenObjects.size }, null, 2));
      entries["checksums.sha256"] = strToU8(await checksumFile(entries));
      setMessage("Creating portable ZIP…");
      downloadFile(zipSync(entries, { level: 0 }), `partsdb-backup-${createdAt.replaceAll(":", "-").replace(".000Z", "Z")}.zip`, "application/zip");
      setMessage(`Portable backup exported: ${Object.values(tables).reduce((total, rows) => total + rows.length, 0)} records and ${seenObjects.size} images.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Backup export failed."); setIsError(true); }
    finally { setWorking(false); }
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; setBackup(null); setMessage(""); setIsError(false); setFileName(file?.name ?? ""); if (!file) return;
    setWorking(true);
    try {
      const validated = await validateArchive(file); setBackup(validated);
      const records = Object.values(validated.database.tables).reduce((total, rows) => total + rows.length, 0);
      setMessage(`Validated: ${records} records and ${validated.imageCount} images from ${new Date(validated.manifest.created_at).toLocaleString()}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The backup ZIP could not be read."); setIsError(true); }
    finally { setWorking(false); }
  }

  async function runImport(siteMode: SiteMode, changeSiteMode: ChangeSiteMode) {
    if (!backup) return;
    if (mode === "restore" && confirmation !== "RESTORE") { setMessage("Type RESTORE exactly before running a full restore."); setIsError(true); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setWorking(true); setMessage("Preparing restore…"); setIsError(false);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Could not identify the restoring administrator.");
      const referencedUsers = new Set<string>();
      for (const [tableName, columns] of Object.entries(userColumns)) for (const row of backup.database.tables[tableName] ?? []) for (const column of columns) if (typeof row[column] === "string") referencedUsers.add(row[column] as string);
      const existingUsers = new Set<string>();
      const ids = [...referencedUsers];
      for (let index = 0; index < ids.length; index += 200) {
        const { data, error } = await supabase.from("profiles").select("id").in("id", ids.slice(index, index + 200));
        if (error) throw new Error(`Could not check user references: ${error.message}`);
        for (const row of data ?? []) existingUsers.add(row.id as string);
      }
      const portableRows = (tableName: string, rows: Row[]) => rows.map((row) => {
        const mapped = { ...row };
        for (const column of userColumns[tableName] ?? []) if (typeof mapped[column] === "string" && !existingUsers.has(mapped[column] as string)) mapped[column] = authData.user.id;
        return mapped;
      });

      if (mode === "restore") {
        const currentObjects: Record<string, string[]> = {};
        for (const tableName of imageTableNames) {
          const { data, error } = await supabase.from(tableName).select("storage_bucket, storage_path");
          if (error) throw new Error(`Restore stopped while reading ${tableName}: ${error.message}`);
          for (const row of data ?? []) if (typeof row.storage_bucket === "string" && typeof row.storage_path === "string") (currentObjects[row.storage_bucket] ??= []).push(row.storage_path);
        }
        for (const [bucket, paths] of Object.entries(currentObjects)) for (let index = 0; index < paths.length; index += 100) {
          const { error } = await supabase.storage.from(bucket).remove(paths.slice(index, index + 100));
          if (error) throw new Error(`Restore stopped while clearing ${bucket}: ${error.message}`);
        }
        const { error: unlinkError } = await supabase.from("companies").update({ default_supplier_id: null }).not("default_supplier_id", "is", null);
        if (unlinkError) throw new Error(`Restore stopped while clearing company supplier links: ${unlinkError.message}`);
        for (const table of deleteOrder) {
          const { error } = await supabase.from(table.name).delete().not(table.deleteColumn, "is", null);
          if (error) throw new Error(`Restore stopped while clearing ${table.name}: ${error.message}`);
        }
      }

      let imported = 0; let uploaded = 0;
      const companySupplierLinks = (backup.database.tables.companies ?? []).flatMap((row) => typeof row.id === "string" && typeof row.default_supplier_id === "string" ? [{ companyId: row.id, supplierId: row.default_supplier_id }] : []);
      for (const table of dataTables) {
        const rows = portableRows(table.name, backup.database.tables[table.name] ?? []);
        for (let index = 0; index < rows.length; index += 200) {
          const chunk = rows.slice(index, index + 200).map((row) => table.name === "companies" ? { ...row, default_supplier_id: null } : row);
          const { error } = await supabase.from(table.name).upsert(chunk); if (error) throw new Error(`Import stopped at ${table.name}: ${error.message}`); imported += chunk.length;
        }
      }
      for (const link of companySupplierLinks) {
        const { error } = await supabase.from("companies").update({ default_supplier_id: link.supplierId }).eq("id", link.companyId);
        if (error) throw new Error(`Import stopped while restoring company supplier links: ${error.message}`);
      }
      for (const tableName of imageTableNames) {
        const rows = portableRows(tableName, backup.database.tables[tableName] ?? []);
        for (const row of rows) {
          const bucket = row.storage_bucket as string; const objectPath = row.storage_path as string;
          if (bucket === "request-images") {
            const { error: removeError } = await supabase.storage.from(bucket).remove([objectPath]);
            if (removeError) throw new Error(`Could not replace ${bucket}/${objectPath}: ${removeError.message}`);
          }
          const { error } = await supabase.storage.from(bucket).upload(objectPath, new Blob([new Uint8Array(backup.entries[safeObjectPath(bucket, objectPath)])]), { upsert: true });
          if (error) throw new Error(`Image upload stopped at ${bucket}/${objectPath}: ${error.message}`); uploaded += 1;
        }
        for (let index = 0; index < rows.length; index += 200) {
          const chunk = rows.slice(index, index + 200); const { error } = await supabase.from(tableName).upsert(chunk);
          if (error) throw new Error(`Image metadata restore stopped at ${tableName}: ${error.message}`); imported += chunk.length;
        }
      }
      const report = { status: "complete", mode, records_processed: imported, images_uploaded: uploaded, source_created_at: backup.manifest.created_at, completed_at: new Date().toISOString() };
      downloadFile(strToU8(JSON.stringify(report, null, 2)), `partsdb-restore-report-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
      setMessage(`${mode === "restore" ? "Full restore" : "Merge import"} completed: ${imported} records and ${uploaded} images processed. Restore report downloaded.`); setConfirmation("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Restore failed."); setIsError(true); }
    finally { setWorking(false); }
  }

  return <AppShell requireAdmin>{() => <main className="workspace backup-workspace"><a className="back-link" href="/admin">← Back to admin</a>
    <section className="workspace-heading"><div><p className="eyebrow accent">Administrator tools</p><h1>Backup, export & import</h1><p>Create or restore a checksum-verified portable copy of PartsDB data and stored images.</p></div></section>
    <div className="backup-grid"><section className="form-card backup-card"><div className="detail-card-heading"><h2>Export backup</h2><span>Portable ZIP v4</span></div><div className="backup-card-body"><p>Exports application records, part images, request images and machine images with revision details and SHA-256 checksums.</p><button className="button primary" type="button" disabled={working} onClick={exportBackup}>{working ? "Working…" : "Download portable backup"}</button></div></section>
      <section className="form-card backup-card"><div className="detail-card-heading"><h2>Import backup</h2><span>Administrator only</span></div><div className="backup-card-body"><label className="file-picker">Portable backup ZIP<input type="file" accept="application/zip,.zip" onChange={selectFile}/><small>{fileName || "No file selected"}</small></label><fieldset><legend>Import mode</legend><label><input type="radio" name="mode" checked={mode === "merge"} onChange={() => { setMode("merge"); setConfirmation(""); }}/><span><strong>Merge safely</strong><small>Add or update matching records and images. Existing unmatched data remains.</small></span></label><label><input type="radio" name="mode" checked={mode === "restore"} onChange={() => setMode("restore")}/><span><strong>Full restore</strong><small>Delete current business data and referenced images, then restore this backup.</small></span></label></fieldset>{mode === "restore" && <label className="restore-confirm">Type RESTORE to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off"/></label>}<button className={`button ${mode === "restore" ? "danger" : "primary"}`} type="button" disabled={working || !backup || siteMode === "standby" || (mode === "restore" && confirmation !== "RESTORE")} onClick={() => void runImport(siteMode, changeSiteMode)}>{working ? "Working…" : mode === "restore" ? "Run full restore" : "Import and merge"}</button></div></section></div>
    {siteMode === "standby" && <section className="backup-note"><strong>Standby protection active</strong><p>Backup export and ZIP validation remain available. Enable Maintenance mode before importing data or images.</p><button className="button primary" type="button" onClick={() => { if (window.prompt("Type ENABLE EDITING to enter Maintenance mode.") === "ENABLE EDITING") void changeSiteMode("maintenance"); }}>Enable maintenance</button></section>}\n    {message && <p className={`backup-message ${isError ? "error" : "success"}`} role="status">{message}</p>}<section className="backup-note"><strong>Portable application backup</strong><p>Authentication accounts, passwords and server secrets are deliberately excluded. Missing user references are assigned to the administrator performing the restore. Validate the restored standby before relying on it.</p></section>
  </main>}</AppShell>;
}
