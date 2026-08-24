"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "./app-shell";
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
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const [machineResult, companyResult, categoryResult, imageResult] = await Promise.all([
      supabase.from("machines").select("id,name,model,notes,manufacturer_id,category_id,is_active,manufacturer:companies(id,name),category:machine_categories(id,name)").order("name"),
      supabase.from("companies").select("id,name,company_roles!inner(role)").eq("company_roles.role", "manufacturer").eq("is_active", true).order("name"),
      supabase.from("machine_categories").select("id,name").eq("is_active", true).order("name"),
      supabase.from("machine_images").select("id,machine_id,storage_path"),
    ]);
    const loadedMachines = (machineResult.data ?? []) as unknown as Machine[];
    setMachines(loadedMachines);
    const requestedEditId = new URLSearchParams(window.location.search).get("edit");
    const requestedMachine = loadedMachines.find((machine) => machine.id === requestedEditId);
    if (requestedMachine) { setEditing(requestedMachine); setNewImage(null); setRemoveImage(false); window.history.replaceState({}, "", window.location.pathname); }
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
    setEditing(null); setNewImage(null); setRemoveImage(false); await load(); setSaving(false); setMessage("Machine updated.");
  }

  return <AppShell requireAdmin>{() => <main className="workspace reference-workspace"><a className="back-link" href="/admin">← Back to administrator portal</a><section className="workspace-heading"><div><p className="eyebrow accent">Machine management</p><h1>Machines</h1><p>Edit machine identity, category, notes, status and image.</p></div></section>{message && <p className="form-message success-message">{message}</p>}<section className="machine-admin-list">{machines.map((machine) => <article key={machine.id}><div>{images[machine.id]?.signedUrl ? <Image unoptimized src={images[machine.id].signedUrl!} alt={machine.name} width={160} height={120}/> : <span className="machine-image-empty">No image</span>}</div><span><strong>{machine.name}</strong><small>{machine.manufacturer?.name}{machine.model ? ` · ${machine.model}` : ""}{machine.category ? ` · ${machine.category.name}` : ""}</small></span><em>{machine.is_active ? "Active" : "Inactive"}</em><a className="button secondary compact" href={`/machines/${machine.id}`}>View</a><button className="button secondary compact" onClick={() => { setEditing(machine); setNewImage(null); setRemoveImage(false); }}>Edit</button></article>)}</section>
    {editing && <div className="modal-backdrop"><form className="machine-edit-modal" onSubmit={save}><div className="detail-card-heading"><h2>Edit machine</h2><button type="button" className="lightbox-close modal-close" onClick={() => setEditing(null)}>×</button></div><div className="form-grid"><label>Machine manufacturer<select required value={editing.manufacturer_id} onChange={(e) => setEditing({ ...editing, manufacturer_id: e.target.value })}>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Category<select value={editing.category_id ?? ""} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}><option value="">No category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Machine name<input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}/></label><label>Model<input value={editing.model ?? ""} onChange={(e) => setEditing({ ...editing, model: e.target.value })}/></label><label className="span-2">Notes<textarea rows={5} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })}/></label><label>Status<select value={editing.is_active ? "active" : "inactive"} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label>Machine image<input type="file" accept="image/*" onChange={(e) => chooseImage(e.target.files?.[0])}/><small>Compressed to WebP before upload.</small></label></div><div className="machine-image-editor">{newImage ? <><Image unoptimized src={newImage.previewUrl} alt="New machine preview" width={320} height={240}/><span>{formatBytes(newImage.originalBytes)} → {formatBytes(newImage.compressedBytes)}</span></> : !removeImage && images[editing.id]?.signedUrl ? <Image unoptimized src={images[editing.id].signedUrl!} alt="Current machine" width={320} height={240}/> : <p>No machine image.</p>}{images[editing.id] && !removeImage && <button type="button" className="button danger compact" onClick={() => { setRemoveImage(true); setNewImage(null); }}>Remove image</button>}</div><div className="form-actions modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save machine"}</button></div></form></div>}
  </main>}</AppShell>;
}
