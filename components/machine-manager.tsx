"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "./app-shell";
import { ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { formatBytes, prepareImage, type PreparedImage } from "../lib/image-compression";

type Named = { id: string; name: string };
type Machine = { id: string; name: string; model: string | null; notes: string | null; manufacturer_id: string; category_id: string | null; is_active: boolean; manufacturer?: Named | null; category?: Named | null };
type MachineImage = { id: string; machine_id: string; storage_path: string; signedUrl?: string };

export function MachineManager() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [companies, setCompanies] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [images, setImages] = useState<Record<string, MachineImage>>({});
  const [editing, setEditing] = useState<Machine | null>(null);
  const [newImage, setNewImage] = useState<PreparedImage | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (keepEditingId = "") => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const [machineResult, companyResult, categoryResult, imageResult] = await Promise.all([
      supabase.from("machines").select("id,name,model,notes,manufacturer_id,category_id,is_active,manufacturer:companies(id,name),category:machine_categories(id,name)").order("name"),
      supabase.from("companies").select("id,name,company_roles!inner(role)").eq("company_roles.role", "manufacturer").eq("is_active", true).order("name"),
      supabase.from("machine_categories").select("id,name").eq("is_active", true).order("name"),
      supabase.from("machine_images").select("id,machine_id,storage_path"),
    ]);
    const loadedMachines = (machineResult.data ?? []) as unknown as Machine[];
    setMachines(loadedMachines);
    const queryEditId = new URLSearchParams(window.location.search).get("edit") ?? "";
    const requestedEditId = keepEditingId || queryEditId;
    const requestedMachine = loadedMachines.find((machine) => machine.id === requestedEditId);
    if (requestedMachine) { setEditing(requestedMachine); setNewImage(null); setRemoveImage(false); if (queryEditId) window.history.replaceState({}, "", window.location.pathname); }
    setCompanies((companyResult.data ?? []) as Named[]); setCategories((categoryResult.data ?? []) as Named[]);
    const rows = (imageResult.data ?? []) as MachineImage[];
    const signed = rows.length ? await supabase.storage.from("machine-images").createSignedUrls(rows.map((row) => row.storage_path), 3600) : { data: [] };
    setImages(Object.fromEntries(rows.map((row, index) => [row.machine_id, { ...row, signedUrl: signed.data?.[index]?.signedUrl }])));
  }, []);
  useEffect(() => {
    // Data is loaded after the asynchronous Supabase calls resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const filteredMachines = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return machines.filter((machine) => !term || [machine.name, machine.model ?? "", machine.manufacturer?.name ?? "", machine.category?.name ?? ""].some((value) => value.toLocaleLowerCase().includes(term)));
  }, [machines, search]);

  function selectMachine(id: string) {
    const machine = machines.find((item) => item.id === id) ?? null;
    setEditing(machine ? { ...machine } : null); setNewImage(null); setRemoveImage(false); setMessage("");
  }

  async function chooseImage(file?: File) { if (!file) return; setMessage(""); try { setNewImage(await prepareImage(file)); setRemoveImage(false); } catch (error) { setMessage(error instanceof Error ? error.message : "Image could not be prepared."); } }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing) return; setSaving(true); setMessage("");
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const updated = await supabase.from("machines").update({ name: editing.name.trim(), model: editing.model?.trim() || null, manufacturer_id: editing.manufacturer_id, category_id: editing.category_id || null, notes: editing.notes?.trim() || null, is_active: editing.is_active }).eq("id", editing.id);
    if (updated.error) { setMessage(updated.error.message); setSaving(false); return; }
    const existing = images[editing.id];
    if ((removeImage || newImage) && existing) {
      const deleted = await supabase.from("machine_images").delete().eq("id", existing.id);
      if (deleted.error) { setMessage(deleted.error.message); setSaving(false); return; }
      await supabase.storage.from("machine-images").remove([existing.storage_path]);
    }
    if (newImage) {
      const path = `${editing.id}/${crypto.randomUUID()}.webp`;
      const uploaded = await supabase.storage.from("machine-images").upload(path, newImage.file, { contentType: "image/webp" });
      if (uploaded.error) { setMessage(uploaded.error.message); setSaving(false); return; }
      const linked = await supabase.from("machine_images").insert({ machine_id: editing.id, storage_path: path });
      if (linked.error) { setMessage(linked.error.message); setSaving(false); return; }
    }
    setNewImage(null); setRemoveImage(false); await load(editing.id); setSaving(false); setMessage("Machine updated.");
  }

  return <AppShell requireAdmin>{(_profile, siteMode) => <main className="workspace form-workspace"><a className="back-link" href="/admin/reference-data">← Back to reference data</a><section className="workspace-heading"><div><p className="eyebrow accent">Database administration</p><h1>Machine editor</h1><p>Search for a machine, then edit its identity, category, notes, status and image.</p></div><span className="admin-badge"><ShieldIcon/>Administrator</span></section>{message && <p className="form-message success-message">{message}</p>}
    <section className="form-card company-picker"><div className="detail-card-heading"><h2>Select machine</h2><span>{filteredMachines.length} matches</span></div><div className="form-grid"><label className="span-2">Search machines<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by machine, manufacturer, model or category"/></label><div className="span-2"><span className="machine-picker-label">Machine</span><div className="machine-picker-list">{filteredMachines.map((machine) => <button type="button" key={machine.id} className={editing?.id === machine.id ? "selected" : ""} aria-pressed={editing?.id === machine.id} onClick={() => selectMachine(machine.id)}><span className="machine-picker-thumb">{images[machine.id]?.signedUrl ? <Image unoptimized src={images[machine.id].signedUrl!} alt="" width={96} height={72}/> : <span>No image</span>}</span><span className="machine-picker-copy"><strong>{machine.name}</strong><small>{[machine.manufacturer?.name, machine.model, machine.category?.name].filter(Boolean).join(" · ") || "No details"}</small></span><em>{machine.is_active ? "Active" : "Inactive"}</em></button>)}{!filteredMachines.length && <p>No matching machines.</p>}</div></div></div></section>
    {editing ? <form className="record-form machine-editor-form" onSubmit={save}><section className="form-card"><div className="detail-card-heading"><h2>Machine information</h2><div className="heading-actions"><span>{editing.is_active ? "Active" : "Inactive"}</span><a className="button secondary compact" href={`/machines/${editing.id}`}>View machine</a></div></div><div className="form-grid"><label>Machine manufacturer<select required value={editing.manufacturer_id} onChange={(e) => setEditing({ ...editing, manufacturer_id: e.target.value })}>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Category<select value={editing.category_id ?? ""} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}><option value="">No category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Machine name<input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}/></label><label>Model<input value={editing.model ?? ""} onChange={(e) => setEditing({ ...editing, model: e.target.value })}/></label><label className="span-2">Notes<textarea rows={5} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })}/></label><label>Status<select value={editing.is_active ? "active" : "inactive"} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label>Machine image<input type="file" accept="image/*" onChange={(e) => chooseImage(e.target.files?.[0])}/><small>Compressed to WebP before upload.</small></label></div><div className="machine-image-editor">{newImage ? <><Image unoptimized src={newImage.previewUrl} alt="New machine preview" width={320} height={240}/><span>{formatBytes(newImage.originalBytes)} → {formatBytes(newImage.compressedBytes)}</span></> : !removeImage && images[editing.id]?.signedUrl ? <Image unoptimized src={images[editing.id].signedUrl!} alt="Current machine" width={320} height={240}/> : <p>No machine image.</p>}{images[editing.id] && !removeImage && <button type="button" className="button danger compact" onClick={() => { setRemoveImage(true); setNewImage(null); }}>Remove image</button>}</div></section><div className="form-actions"><button type="button" className="button secondary" onClick={() => selectMachine(editing.id)}>Discard changes</button><button className="button primary" disabled={saving || siteMode === "standby"}>{siteMode === "standby" ? "Standby read-only" : saving ? "Saving…" : "Save machine"}</button></div></form> : <section className="detail-state company-empty"><p>Select a machine above to open the full editor.</p></section>}
  </main>}</AppShell>;
}
