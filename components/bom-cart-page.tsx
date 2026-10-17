"use client";

import { useEffect, useMemo, useState } from "react";
import { PartThumbnail, type PartThumbnailImage } from "./part-thumbnail";
import { AppShell } from "./app-shell";
import { BoxIcon, CopyIcon } from "./icons";
import { clearBomCart, removeFromBom, updateBomItem, useBomCart } from "../lib/bom-cart";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { useSupplyTypes } from "../lib/use-supply-types";

type PartInfo = { part_images?: PartThumbnailImage[]; id: string; description: string; manufacturer_part_number: string | null; supply_type: string };
type SupplierInfo = { part_id: string; supplier_part_number: string | null; supplier?: { name: string } | null };
type MachineInfo = { part_id: string; machine?: { name: string | null; model: string | null; manufacturer?: { name: string } | null } | null };

function csvCell(value: string | number) { const text = String(value), safe = typeof value === "string" && /^[=+@-]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }

function BomCopyButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Could not copy");
    }
  }
  return <button type="button" title={label} aria-label={label} onClick={copy}>
    <CopyIcon/><span className="sr-only" role="status">{status}</span>{status && <em aria-hidden="true">{status}</em>}
  </button>;
}

export function BomCartPage() {
  const cart = useBomCart(), supplyTypes = useSupplyTypes();
  const [parts, setParts] = useState<PartInfo[]>([]), [suppliers, setSuppliers] = useState<SupplierInfo[]>([]), [machines, setMachines] = useState<MachineInfo[]>([]), [loadedKey, setLoadedKey] = useState("");
  const partIds = useMemo(() => cart.map((item) => item.partId), [cart]);
  const partIdsKey = partIds.join(",");
  const loading = Boolean(partIdsKey && loadedKey !== partIdsKey);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient(), requestedIds = partIdsKey ? partIdsKey.split(",") : []; if (!supabase || !requestedIds.length) return;
    Promise.all([
      supabase.from("parts").select("id,description,manufacturer_part_number,supply_type,part_images(id,storage_path,caption,sort_order)").in("id", requestedIds),
      supabase.from("part_suppliers").select("part_id,supplier_part_number,supplier:companies(name)").in("part_id", requestedIds).eq("preference_rank", 1).eq("is_active", true),
      supabase.from("part_machines").select("part_id,machine:machines(name,model,manufacturer:companies(name))").in("part_id", requestedIds),
    ]).then(([partResult, supplierResult, machineResult]) => { setParts((partResult.data ?? []) as PartInfo[]); setSuppliers((supplierResult.data ?? []) as unknown as SupplierInfo[]); setMachines((machineResult.data ?? []) as unknown as MachineInfo[]); setLoadedKey(partIdsKey); });
  }, [partIdsKey]);

  function exportCsv() {
    const header = ["Quantity", "Part description", "Manufacturer part number", "Preferred supplier", "Preferred supplier part number", "Supply type", "Compatible machines", "Notes"];
    const rows = cart.map((item) => { const part = parts.find((row) => row.id === item.partId), supplier = suppliers.find((row) => row.part_id === item.partId); const compatible = machines.filter((row) => row.part_id === item.partId).map((row) => [row.machine?.manufacturer?.name, row.machine?.name, row.machine?.model].filter(Boolean).join(" · ")).join("; "); return [item.quantity, part?.description ?? "Unavailable part", part?.manufacturer_part_number ?? "", supplier?.supplier?.name ?? "", supplier?.supplier_part_number ?? "", supplyTypes.find((type) => type.code === part?.supply_type)?.name ?? part?.supply_type ?? "", compatible, item.notes]; });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `PartsDB-BOM-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  function clear() { if (window.confirm("Clear every part from this BOM cart?")) clearBomCart(); }

  return <AppShell>{() => <main className="workspace bom-workspace">
    <section className="workspace-heading"><div><p className="eyebrow accent">Session list</p><h1>BOM Cart</h1><p>Adjust quantities and notes, then export the completed list.</p></div><div className="heading-actions"><button type="button" className="button secondary" disabled={!cart.length} onClick={clear}>Clear cart</button><button type="button" className="button primary" disabled={!cart.length || loading} onClick={exportCsv}>Export CSV</button></div></section>
    {!cart.length ? <section className="detail-state bom-empty"><BoxIcon/><h1>Your BOM cart is empty</h1><p>Add parts while searching or viewing a part record.</p><a className="button primary" href="/dashboard">Browse parts</a></section> : <section className="bom-list">
      <div className="bom-head"><span>Part</span><span>Preferred supplier</span><span>Quantity</span><span>Notes</span><span></span></div>
      {cart.map((item) => { const part = parts.find((row) => row.id === item.partId), supplier = suppliers.find((row) => row.part_id === item.partId); return <article className="bom-row" key={item.partId}>
        <div className="bom-part-copy">
          <PartThumbnail images={part?.part_images} description={part?.description ?? "Part"}/>
          <div className="bom-part-text">
          <div className="value-with-copy"><a href={`/parts/${item.partId}`}><strong>{part?.description ?? (loading ? "Loading part…" : "Unavailable part")}</strong></a>{part?.description && <BomCopyButton value={part.description} label="Copy part description"/>}</div>
          <div className="value-with-copy"><a href={`/parts/${item.partId}`}><small>{part?.manufacturer_part_number || "No manufacturer part number"}</small></a>{part?.manufacturer_part_number && <BomCopyButton value={part.manufacturer_part_number} label="Copy manufacturer part number"/>}</div>
          </div>
        </div>
        <span><strong>{supplier?.supplier?.name ?? "—"}</strong><small>{supplier?.supplier_part_number ?? "No supplier part number"}</small></span>
        <label>Quantity<input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateBomItem(item.partId, { quantity: Number(event.target.value) || 1 })}/></label>
        <label>Line notes<input value={item.notes} placeholder="Optional notes" onChange={(event) => updateBomItem(item.partId, { notes: event.target.value })}/></label>
        <button type="button" className="button danger compact" onClick={() => removeFromBom(item.partId)}>Remove</button>
      </article>; })}
    </section>}
  </main>}</AppShell>;
}
