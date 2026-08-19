"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { AppShell } from "./app-shell";
import { ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { createXlsx, readXlsx, type WorkbookRows } from "../lib/simple-xlsx";

type Row = Record<string, string>;
type ImportData = { manufacturers: Row[]; suppliers: Row[]; machines: Row[] };
type ValidationIssue = { sheet: string; row: number; message: string };
type ImportSummary = { added: number; updated: number; skipped: number; failed: number };

const emptyData: ImportData = { manufacturers: [], suppliers: [], machines: [] };
const clean = (value: unknown) => String(value ?? "").trim();
const key = (value: string) => value.trim().toLocaleLowerCase();

function rowsFromSheet(workbook: WorkbookRows, sheetName: string): Row[] {
  const actualName = Object.keys(workbook).find((name) => key(name) === key(sheetName));
  if (!actualName) return [];
  const [headings = [], ...sourceRows] = workbook[actualName];
  return sourceRows.map((source) => {
    const row: Row = {}; let hasValue = false;
    headings.forEach((heading, column) => { const value = clean(source?.[column]); row[key(heading)] = value; if (value) hasValue = true; });
    return hasValue ? row : null;
  }).filter((row): row is Row => row !== null);
}

function validate(data: ImportData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const duplicateCheck = (sheet: keyof ImportData, column: string, label: string) => {
    const seen = new Set<string>();
    data[sheet].forEach((row, index) => {
      const value = row[key(column)];
      if (!value) issues.push({ sheet, row: index + 2, message: `${label} is required.` });
      else if (seen.has(key(value))) issues.push({ sheet, row: index + 2, message: `Duplicate ${label.toLowerCase()} in workbook: ${value}` });
      else seen.add(key(value));
    });
  };
  duplicateCheck("manufacturers", "Manufacturer Name", "Manufacturer Name");
  duplicateCheck("suppliers", "Supplier Name", "Supplier Name");
  const seenMachines = new Set<string>();
  data.machines.forEach((row, index) => {
    const name = row[key("Machine Name")]; const manufacturer = row[key("Manufacturer")];
    if (!name) issues.push({ sheet: "machines", row: index + 2, message: "Machine Name is required." });
    if (!manufacturer) issues.push({ sheet: "machines", row: index + 2, message: "Manufacturer is required." });
    if (name && manufacturer) {
      const machineKey = `${key(manufacturer)}:${key(name)}`;
      if (seenMachines.has(machineKey)) issues.push({ sheet: "machines", row: index + 2, message: `Duplicate machine for ${manufacturer}: ${name}` });
      else seenMachines.add(machineKey);
    }
  });
  return issues;
}

async function makeTemplate() {
  const buffer = createXlsx({
    Manufacturers: [["Manufacturer Name", "Default Supplier", "Notes"], ["Example Manufacturer", "Example Supplier", ""]],
    Suppliers: [["Supplier Name", "Supply Type", "Website URL", "Ordering Information", "Notes"], ["Example Supplier", "Unknown", "", "", ""]],
    Machines: [["Machine Name", "Machine Model", "Manufacturer"], ["Example Machine", "Optional model", "Example Manufacturer"]],
  });
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "PartsDB-reference-import-template.xlsx"; anchor.click(); URL.revokeObjectURL(url);
}

export function BulkReferenceImport() {
  const [data, setData] = useState<ImportData>(emptyData);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const issues = useMemo(() => validate(data), [data]);
  const totalRows = data.manufacturers.length + data.suppliers.length + data.machines.length;

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setMessage(""); setSummary(null); setImportErrors([]);
    if (!file) return;
    try {
      const workbook = readXlsx(new Uint8Array(await file.arrayBuffer()));
      setData({
        manufacturers: rowsFromSheet(workbook, "Manufacturers"),
        suppliers: rowsFromSheet(workbook, "Suppliers"),
        machines: rowsFromSheet(workbook, "Machines"),
      });
      setFileName(file.name);
    } catch {
      setData(emptyData); setFileName(""); setMessage("That file could not be read. Use the downloaded Excel template.");
    }
  }

  async function runImport() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !totalRows || issues.length) return;
    setImporting(true); setMessage(""); setSummary(null); setImportErrors([]);
    const result: ImportSummary = { added: 0, updated: 0, skipped: 0, failed: 0 };
    const rowErrors: string[] = [];
    try {
      const [manufacturerResult, supplierResult, machineResult, supplyTypeResult] = await Promise.all([
        supabase.from("manufacturers").select("id,name"),
        supabase.from("suppliers").select("id,name"),
        supabase.from("machines").select("id,name,model,manufacturer_id"),
        supabase.from("supply_types").select("code,name").eq("is_active", true),
      ]);
      const firstError = manufacturerResult.error || supplierResult.error || machineResult.error || supplyTypeResult.error;
      if (firstError) throw firstError;
      const manufacturers = new Map((manufacturerResult.data ?? []).map((item) => [key(item.name), item]));
      const suppliers = new Map((supplierResult.data ?? []).map((item) => [key(item.name), item]));
      const supplyTypes = new Map<string, string>();
      const manufacturersEligibleForDefault = new Set<string>();
      (supplyTypeResult.data ?? []).forEach((item) => { supplyTypes.set(key(item.name), item.code); supplyTypes.set(key(item.code), item.code); });

      // Create manufacturers first without the optional supplier link.
      for (const [index, row] of data.manufacturers.entries()) {
        const name = row[key("Manufacturer Name")]; const existing = manufacturers.get(key(name));
        const values = { name, notes: row[key("Notes")] || null, is_active: true };
        if (existing && mode === "skip") { result.skipped++; continue; }
        const query = existing ? supabase.from("manufacturers").update(values).eq("id", existing.id).select("id,name").single() : supabase.from("manufacturers").insert(values).select("id,name").single();
        const { data: saved, error } = await query;
        if (error || !saved) { result.failed++; rowErrors.push(`Manufacturers, row ${index + 2}: ${error?.message ?? "Could not save row."}`); }
        else { manufacturers.set(key(name), saved); manufacturersEligibleForDefault.add(key(name)); if (existing) result.updated++; else result.added++; }
      }

      for (const [index, row] of data.suppliers.entries()) {
        const name = row[key("Supplier Name")]; const existing = suppliers.get(key(name));
        const requestedType = row[key("Supply Type")] || "unknown";
        const supplyType = supplyTypes.get(key(requestedType));
        if (!supplyType) { result.failed++; rowErrors.push(`Suppliers, row ${index + 2}: Supply Type “${requestedType}” does not exist.`); continue; }
        const values = { name, supply_type: supplyType, website_url: row[key("Website URL")] || null, ordering_information: row[key("Ordering Information")] || null, notes: row[key("Notes")] || null, is_active: true };
        if (existing && mode === "skip") { result.skipped++; continue; }
        const query = existing ? supabase.from("suppliers").update(values).eq("id", existing.id).select("id,name").single() : supabase.from("suppliers").insert(values).select("id,name").single();
        const { data: saved, error } = await query;
        if (error || !saved) { result.failed++; rowErrors.push(`Suppliers, row ${index + 2}: ${error?.message ?? "Could not save row."}`); }
        else { suppliers.set(key(name), saved); if (existing) result.updated++; else result.added++; }
      }

      // Apply default suppliers after both reference sets exist.
      for (const [index, row] of data.manufacturers.entries()) {
        const defaultName = row[key("Default Supplier")];
        if (!defaultName) continue;
        if (!manufacturersEligibleForDefault.has(key(row[key("Manufacturer Name")]))) continue;
        const manufacturer = manufacturers.get(key(row[key("Manufacturer Name")]));
        const supplier = suppliers.get(key(defaultName));
        if (!manufacturer || !supplier) { result.failed++; rowErrors.push(`Manufacturers, row ${index + 2}: Default Supplier “${defaultName}” does not exist.`); continue; }
        const { error } = await supabase.from("manufacturers").update({ default_supplier_id: supplier.id }).eq("id", manufacturer.id);
        if (error) { result.failed++; rowErrors.push(`Manufacturers, row ${index + 2}: ${error.message}`); }
      }

      const machines = new Map((machineResult.data ?? []).map((item) => [`${item.manufacturer_id}:${key(item.name)}`, item]));
      for (const [index, row] of data.machines.entries()) {
        const name = row[key("Machine Name")]; const model = row[key("Machine Model")]; const manufacturer = manufacturers.get(key(row[key("Manufacturer")]));
        if (!manufacturer) { result.failed++; rowErrors.push(`Machines, row ${index + 2}: Manufacturer “${row[key("Manufacturer")]}” does not exist.`); continue; }
        const machineKey = `${manufacturer.id}:${key(name)}`; const existing = machines.get(machineKey);
        const values = { manufacturer_id: manufacturer.id, name, model: model || null, is_active: true };
        if (existing && mode === "skip") { result.skipped++; continue; }
        const query = existing ? supabase.from("machines").update(values).eq("id", existing.id).select("id,name,model,manufacturer_id").single() : supabase.from("machines").insert(values).select("id,name,model,manufacturer_id").single();
        const { data: saved, error } = await query;
        if (error || !saved) { result.failed++; rowErrors.push(`Machines, row ${index + 2}: ${error?.message ?? "Could not save row."}`); }
        else { machines.set(machineKey, saved); if (existing) result.updated++; else result.added++; }
      }
      setSummary(result);
      setImportErrors(rowErrors);
      setMessage(result.failed ? "Import completed with errors. Check names and supply types, then retry failed rows." : "Import completed successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import stopped unexpectedly.");
    } finally { setImporting(false); }
  }

  return <AppShell requireAdmin>{() => <main className="workspace bulk-import-workspace">
    <a className="back-link" href="/admin">← Back to administrator portal</a>
    <section className="workspace-heading"><div><p className="eyebrow accent">Database administration</p><h1>Bulk import reference data</h1><p>Import manufacturers, suppliers and machines from one Excel workbook.</p></div><span className="admin-badge"><ShieldIcon/>Administrator</span></section>
    <section className="admin-panel import-panel">
      <div className="import-actions"><button type="button" className="button secondary" onClick={makeTemplate}>Download Excel template</button><label className="button primary file-button">Choose completed workbook<input type="file" accept=".xlsx,.xls" onChange={selectFile}/></label></div>
      <p className="import-help">Keep the three sheet names unchanged. Names are matched without regard to capital letters.</p>
      {fileName && <p><strong>Selected:</strong> {fileName}</p>}
      {message && <p className={`form-message ${summary?.failed ? "" : "success-message"}`}>{message}</p>}
      {totalRows > 0 && <>
        <div className="import-counts"><article><strong>{data.manufacturers.length}</strong><span>Manufacturers</span></article><article><strong>{data.suppliers.length}</strong><span>Suppliers</span></article><article><strong>{data.machines.length}</strong><span>Machines</span></article></div>
        {issues.length > 0 ? <div className="import-errors"><h2>Fix before importing</h2>{issues.slice(0, 30).map((issue, index) => <p key={`${issue.sheet}-${issue.row}-${index}`}><strong>{issue.sheet}, row {issue.row}:</strong> {issue.message}</p>)}</div> : <p className="form-message success-message">Workbook structure is valid and ready to import.</p>}
        <div className="import-mode"><label><input type="radio" checked={mode === "skip"} onChange={() => setMode("skip")}/> Skip records that already exist</label><label><input type="radio" checked={mode === "update"} onChange={() => setMode("update")}/> Update records that already exist</label></div>
        <button type="button" className="button primary" disabled={importing || issues.length > 0} onClick={runImport}>{importing ? "Importing…" : `Import ${totalRows} rows`}</button>
      </>}
      {summary && <div className="import-summary"><strong>Import summary</strong><span>{summary.added} added</span><span>{summary.updated} updated</span><span>{summary.skipped} skipped</span><span>{summary.failed} failed</span></div>}
      {importErrors.length > 0 && <div className="import-errors"><h2>Rows not imported</h2>{importErrors.map((error) => <p key={error}>{error}</p>)}</div>}
    </section>
  </main>}</AppShell>;
}
