"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell, type Profile } from "./app-shell";
import { PlusIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type Named = { id: string; name: string };
type Machine = { id: string; model: string; name: string | null; manufacturer?: Named | null };
type Revision = { id: string; revision: string; machine_id: string };
type ExistingPart = { id: string; description: string; internal_part_number: string | null };
type SupplierDraft = { supplier_id: string; supplier_part_number: string; ordering_information: string; notes: string };

const emptySupplier = (): SupplierDraft => ({ supplier_id: "", supplier_part_number: "", ordering_information: "", notes: "" });

export function PartRequestForm() {
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState<Named[]>([]);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [tags, setTags] = useState<Named[]>([]);
  const [parts, setParts] = useState<ExistingPart[]>([]);
  const [machineId, setMachineId] = useState("");
  const [machineManufacturer, setMachineManufacturer] = useState("");
  const [machineModel, setMachineModel] = useState("");
  const [machineRevision, setMachineRevision] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [partManufacturer, setPartManufacturer] = useState("");
  const [manufacturerPartNumber, setManufacturerPartNumber] = useState("");
  const [supplyType, setSupplyType] = useState("unknown");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [machineRevisionIds, setMachineRevisionIds] = useState<string[]>([]);
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [supplierRows, setSupplierRows] = useState<SupplierDraft[]>([emptySupplier(), emptySupplier(), emptySupplier()]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    Promise.all([
      supabase.from("manufacturers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("machines").select("id,model,name,manufacturer:manufacturers(id,name)").eq("is_active", true).order("model"),
      supabase.from("machine_revisions").select("id,revision,machine_id").eq("is_active", true).order("revision"),
      supabase.from("tags").select("id,name").order("name"),
      supabase.from("parts").select("id,description,internal_part_number").eq("status", "active").order("description"),
    ]).then(([mfr, supp, machine, revision, tag, existing]) => {
      setManufacturers((mfr.data ?? []) as Named[]); setSuppliers((supp.data ?? []) as Named[]);
      setMachines((machine.data ?? []) as unknown as Machine[]); setRevisions((revision.data ?? []) as Revision[]);
      setTags((tag.data ?? []) as Named[]); setParts((existing.data ?? []) as ExistingPart[]);
    });
  }, []);

  function selectMachine(id: string) {
    setMachineId(id);
    const machine = machines.find((item) => item.id === id);
    if (machine) { setMachineManufacturer(machine.manufacturer?.name ?? ""); setMachineModel(machine.model); setMachineRevision(""); }
  }

  function updateSupplier(index: number, field: keyof SupplierDraft, value: string) {
    setSupplierRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  }

  async function submit(event: FormEvent, profile: Profile) {
    event.preventDefault(); setSaving(true); setMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const supplierInformation = supplierRows.filter((row) => row.supplier_id).map((row, index) => ({ ...row, preference_rank: index + 1, supplier_name: suppliers.find((supplier) => supplier.id === row.supplier_id)?.name ?? "" }));
    const { data: request, error } = await supabase.from("part_requests").insert({ requested_by: profile.id, status: "draft", machine_manufacturer: machineManufacturer || null, machine_model: machineModel || null, machine_revision: machineRevision || null, machine_revision_ids: machineRevisionIds, part_description: partDescription, part_manufacturer: partManufacturer || null, manufacturer_part_number: manufacturerPartNumber || null, supplier_information: supplierInformation, supply_type: supplyType, compatibility_tags: selectedTags, commonly_ordered_part_ids: relatedIds, notes: notes || null }).select("id").single();
    if (error || !request) { setMessage(error?.message ?? "The request could not be created."); setSaving(false); return; }

    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${profile.id}/${request.id}/${index}-${safeName}`;
      const upload = await supabase.storage.from("request-images").upload(path, file);
      if (!upload.error) await supabase.from("request_images").insert({ request_id: request.id, storage_path: path, uploaded_by: profile.id, kind: "other", sort_order: index });
    }
    const submitted = await supabase.from("part_requests").update({ status: "pending", submitted_at: new Date().toISOString() }).eq("id", request.id);
    if (submitted.error) { setMessage(submitted.error.message); setSaving(false); return; }
    router.push("/requests");
  }

  return <AppShell>{(profile) => <main className="workspace form-workspace">
    <a className="back-link" href="/dashboard">← Back to parts search</a>
    <section className="workspace-heading"><div><p className="eyebrow accent">New database request</p><h1>Add part</h1><p>Provide the available ordering and machine information for administrator review.</p></div></section>
    <form className="record-form" onSubmit={(event) => submit(event, profile)}>
      <section className="form-card"><div className="detail-card-heading"><h2>Part information</h2><span>Required fields marked *</span></div><div className="form-grid">
        <label className="span-2">Part Description *<input required value={partDescription} onChange={(e) => setPartDescription(e.target.value)} /></label>
        <label>Part manufacturer<select value={partManufacturer} onChange={(e) => setPartManufacturer(e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
        <label>Part Number Manufacturer<input value={manufacturerPartNumber} onChange={(e) => setManufacturerPartNumber(e.target.value)} /></label>
        <label>Supply type<select value={supplyType} onChange={(e) => setSupplyType(e.target.value)}><option value="unknown">Unknown</option><option value="local">Local supply</option><option value="dfl">DFL</option></select></label>
      </div></section>
      <section className="form-card"><div className="detail-card-heading"><h2>Machine compatibility</h2></div><div className="form-grid">
        <label className="span-2">Machine Name<select value={machineId} onChange={(e) => selectMachine(e.target.value)}><option value="">Select an existing machine</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name ?? machine.model} · {machine.model}</option>)}</select></label>
        <label>Machine Rev<select value={machineRevision} onChange={(e) => setMachineRevision(e.target.value)}><option value="">Select revision</option>{revisions.filter((item) => !machineId || item.machine_id === machineId).map((item) => <option key={item.id} value={item.revision}>{item.revision}</option>)}</select></label>
        <label>Machine Manufacturer<select value={machineManufacturer} onChange={(e) => setMachineManufacturer(e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
        <label className="span-2">Additional compatible machines<select multiple value={machineRevisionIds} onChange={(e) => setMachineRevisionIds(Array.from(e.target.selectedOptions, (option) => option.value))}>{revisions.filter((revision) => revision.machine_id !== machineId).map((revision) => { const machine = machines.find((item) => item.id === revision.machine_id); return <option key={revision.id} value={revision.id}>{machine?.manufacturer?.name} · {machine?.name ?? machine?.model} · Rev {revision.revision}</option>; })}</select><small>Select every additional machine revision that uses this same part.</small></label>
        <label>Compatibility tags<select multiple value={selectedTags} onChange={(e) => setSelectedTags(Array.from(e.target.selectedOptions, (option) => option.value))}>{tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}</select><small>Hold Ctrl/Cmd to select multiple.</small></label>
      </div></section>
      <section className="form-card"><div className="detail-card-heading"><h2>Part supplier information</h2><span>Up to three</span></div><div className="supplier-form-list">{supplierRows.map((row, index) => <div className="supplier-form-row" key={index}><span>{index + 1}</span><label>{index === 0 ? "Part Supplier" : "Additional Supplier"}<select value={row.supplier_id} onChange={(e) => updateSupplier(index, "supplier_id", e.target.value)}><option value="">Not selected</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>{index === 0 ? "Part Number local supplier" : "Supplier part number"}<input value={row.supplier_part_number} onChange={(e) => updateSupplier(index, "supplier_part_number", e.target.value)} /></label><label>Ordering information<input value={row.ordering_information} onChange={(e) => updateSupplier(index, "ordering_information", e.target.value)} /></label></div>)}</div></section>
      <section className="form-card"><div className="detail-card-heading"><h2>Additional information</h2></div><div className="form-grid">
        <label className="span-2">Commonly ordered parts<select multiple value={relatedIds} onChange={(e) => setRelatedIds(Array.from(e.target.selectedOptions, (option) => option.value))}>{parts.map((part) => <option key={part.id} value={part.id}>{part.internal_part_number ?? "No internal number"} · {part.description}</option>)}</select></label>
        <label className="span-2">Notes<textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="span-2">Part images<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /><small>{files.length ? `${files.length} image(s) selected` : "JPEG, PNG or WebP; multiple images allowed."}</small></label>
      </div></section>
      {message && <p className="form-message">{message}</p>}
      <div className="form-actions"><a className="button secondary" href="/dashboard">Cancel</a><button className="button primary" disabled={saving}><PlusIcon/>{saving ? "Submitting…" : "Submit add request"}</button></div>
    </form>
  </main>}</AppShell>;
}
