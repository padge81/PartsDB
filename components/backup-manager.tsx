"use client";

import { useState, type ChangeEvent } from "react";
import { AppShell } from "./app-shell";
import { getSupabaseBrowserClient } from "../lib/supabase";

type BackupTable = { name: string; deleteColumn: string };
type BackupFile = { format: "PartsDB backup"; version: 1; exported_at: string; tables: Record<string, Record<string, unknown>[]> };

const importOrder: BackupTable[] = [
  { name: "manufacturers", deleteColumn: "id" }, { name: "suppliers", deleteColumn: "id" },
  { name: "machines", deleteColumn: "id" }, { name: "machine_revisions", deleteColumn: "id" },
  { name: "parts", deleteColumn: "id" }, { name: "part_requests", deleteColumn: "id" },
  { name: "part_suppliers", deleteColumn: "part_id" }, { name: "part_machine_revisions", deleteColumn: "part_id" },
  { name: "part_images", deleteColumn: "id" }, { name: "request_images", deleteColumn: "id" },
  { name: "tags", deleteColumn: "id" }, { name: "part_tags", deleteColumn: "part_id" },
  { name: "commonly_ordered_parts", deleteColumn: "part_id" },
];
const imageTables = new Set(["part_images", "request_images"]);
const restorableOrder = importOrder.filter((table) => !imageTables.has(table.name));
const deleteOrder = [...restorableOrder].reverse();

export function BackupManager() {
  const [backup, setBackup] = useState<BackupFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"merge" | "restore">("merge");
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function exportBackup() {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setWorking(true); setMessage(""); setIsError(false); const tables: BackupFile["tables"] = {};
    for (const table of importOrder) {
      const { data, error } = await supabase.from(table.name).select("*");
      if (error) { setMessage(`Export stopped at ${table.name}: ${error.message}`); setIsError(true); setWorking(false); return; }
      tables[table.name] = (data ?? []) as Record<string, unknown>[];
    }
    const payload: BackupFile = { format: "PartsDB backup", version: 1, exported_at: new Date().toISOString(), tables };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `partsdb-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    setMessage(`Backup exported with ${Object.values(tables).reduce((total, rows) => total + rows.length, 0)} records.`); setWorking(false);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; setBackup(null); setMessage(""); setIsError(false); setFileName(file?.name ?? ""); if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      if (parsed.format !== "PartsDB backup" || parsed.version !== 1 || !parsed.tables || typeof parsed.tables !== "object") throw new Error("This is not a supported PartsDB backup file.");
      for (const table of importOrder) if (parsed.tables[table.name] && !Array.isArray(parsed.tables[table.name])) throw new Error(`Invalid ${table.name} data.`);
      setBackup(parsed); setMessage(`Ready: ${Object.values(parsed.tables).reduce((total, rows) => total + rows.length, 0)} records from ${new Date(parsed.exported_at).toLocaleString()}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The backup file could not be read."); setIsError(true); }
  }

  async function runImport() {
    if (!backup) return;
    if (mode === "restore" && confirmation !== "RESTORE") { setMessage("Type RESTORE exactly before running a full restore."); setIsError(true); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setWorking(true); setMessage(""); setIsError(false);
    if (mode === "restore") for (const table of deleteOrder) {
      const { error } = await supabase.from(table.name).delete().not(table.deleteColumn, "is", null);
      if (error) { setMessage(`Restore stopped while clearing ${table.name}: ${error.message}`); setIsError(true); setWorking(false); return; }
    }
    let imported = 0;
    for (const table of restorableOrder) {
      const rows = backup.tables[table.name] ?? [];
      for (let index = 0; index < rows.length; index += 200) {
        const chunk = rows.slice(index, index + 200);
        const { error } = await supabase.from(table.name).upsert(chunk);
        if (error) { setMessage(`Import stopped at ${table.name}: ${error.message}`); setIsError(true); setWorking(false); return; }
        imported += chunk.length;
      }
    }
    setMessage(`${mode === "restore" ? "Full restore" : "Merge import"} completed: ${imported} records processed. Image records were left unchanged.`); setConfirmation(""); setWorking(false);
  }

  return <AppShell requireAdmin>{() => <main className="workspace backup-workspace"><a className="back-link" href="/admin">← Back to admin</a>
    <section className="workspace-heading"><div><p className="eyebrow accent">Administrator tools</p><h1>Backup, export & import</h1><p>Download a portable copy of PartsDB data or restore a previous export.</p></div></section>
    <div className="backup-grid"><section className="form-card backup-card"><div className="detail-card-heading"><h2>Export backup</h2><span>Versioned JSON</span></div><div className="backup-card-body"><p>Exports parts, requests, suppliers, manufacturers, machines and their relationships. Image database records are included; stored image files remain in Supabase Storage.</p><button className="button primary" type="button" disabled={working} onClick={exportBackup}>{working ? "Working…" : "Download backup"}</button></div></section>
      <section className="form-card backup-card"><div className="detail-card-heading"><h2>Import backup</h2><span>Administrator only</span></div><div className="backup-card-body"><label className="file-picker">Backup JSON file<input type="file" accept="application/json,.json" onChange={selectFile}/><small>{fileName || "No file selected"}</small></label><fieldset><legend>Import mode</legend><label><input type="radio" name="mode" checked={mode === "merge"} onChange={() => { setMode("merge"); setConfirmation(""); }}/><span><strong>Merge safely</strong><small>Add new records and update matching IDs. Existing unmatched records remain.</small></span></label><label><input type="radio" name="mode" checked={mode === "restore"} onChange={() => setMode("restore")}/><span><strong>Full restore</strong><small>Delete current business data, then restore the selected backup.</small></span></label></fieldset>{mode === "restore" && <label className="restore-confirm">Type RESTORE to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off"/></label>}<button className={`button ${mode === "restore" ? "danger" : "primary"}`} type="button" disabled={working || !backup || (mode === "restore" && confirmation !== "RESTORE")} onClick={runImport}>{working ? "Working…" : mode === "restore" ? "Run full restore" : "Import and merge"}</button></div></section></div>
    {message && <p className={`backup-message ${isError ? "error" : "success"}`} role="status">{message}</p>}<section className="backup-note"><strong>Not included</strong><p>User authentication accounts, passwords and binary image files in Supabase Storage are not changed by import. Image metadata is retained in exports for reference, but image database records are left unchanged during merge and full restore.</p></section>
  </main>}</AppShell>;
}
