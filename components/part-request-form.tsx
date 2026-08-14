"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AppShell, type Profile } from "./app-shell";
import { PlusIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { formatBytes, prepareImage, type PreparedImage } from "../lib/image-compression";

type Named = { id: string; name: string };
type Machine = { id: string; model: string; name: string | null; manufacturer?: Named | null };
type ExistingPart = { id: string; description: string; internal_part_number: string | null };
type SupplierDraft = { supplier_id: string; supplier_part_number: string; ordering_information: string; notes: string };
type MachineDraft = { manufacturer_id: string; machine_id: string; revision_id: string };

const emptySupplier = (): SupplierDraft => ({ supplier_id: "", supplier_part_number: "", ordering_information: "", notes: "" });

export function PartRequestForm() {
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState<Named[]>([]);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [parts, setParts] = useState<ExistingPart[]>([]);
  const [machineId, setMachineId] = useState("");
  const [machineManufacturerId, setMachineManufacturerId] = useState("");
  const [machineManufacturer, setMachineManufacturer] = useState("");
  const [machineModel, setMachineModel] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [partManufacturer, setPartManufacturer] = useState("");
  const [manufacturerPartNumber, setManufacturerPartNumber] = useState("");
  const [supplyType, setSupplyType] = useState("unknown");
  const [additionalMachines, setAdditionalMachines] = useState<MachineDraft[]>([]);
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [supplierRows, setSupplierRows] = useState<SupplierDraft[]>([emptySupplier(), emptySupplier(), emptySupplier()]);
  const [files, setFiles] = useState<PreparedImage[]>([]);
  const previewUrls = useRef<string[]>([]);
  const [processingImages, setProcessingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    Promise.all([
      supabase.from("manufacturers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("machines").select("id,model,name,manufacturer:manufacturers(id,name)").eq("is_active", true).order("model"),
      supabase.from("parts").select("id,description,internal_part_number").eq("status", "active").order("description"),
    ]).then(([mfr, supp, machine, existing]) => {
      setManufacturers((mfr.data ?? []) as Named[]); setSuppliers((supp.data ?? []) as Named[]);
      setMachines((machine.data ?? []) as unknown as Machine[]); setParts((existing.data ?? []) as ExistingPart[]);
    });
  }, []);
  useEffect(() => () => previewUrls.current.forEach(URL.revokeObjectURL), []);

  async function selectImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []); event.target.value = ""; if (!selected.length) return;
    if (files.length + selected.length > 8) { setMessage("A maximum of 8 images can be added to one request."); return; }
    setProcessingImages(true); setMessage("");
    try { const prepared = await Promise.all(selected.map(prepareImage)); previewUrls.current.push(...prepared.map((image) => image.previewUrl)); setFiles((current) => [...current, ...prepared]); }
    catch (error) { setMessage(error instanceof Error ? error.message : "One or more images could not be processed."); }
    setProcessingImages(false);
  }

  function removeImage(index: number) { setFiles((current) => { URL.revokeObjectURL(current[index].previewUrl); return current.filter((_, imageIndex) => imageIndex !== index); }); }

  function selectMachine(id: string) {
    setMachineId(id);
    const machine = machines.find((item) => item.id === id);
    if (machine) { setMachineManufacturer(machine.manufacturer?.name ?? ""); setMachineModel(machine.model); }
  }

  function selectMachineManufacturer(id: string) {
    setMachineManufacturerId(id); setMachineManufacturer(manufacturers.find((item) => item.id === id)?.name ?? ""); setMachineId(""); setMachineModel("");
  }

  function updateSupplier(index: number, field: keyof SupplierDraft, value: string) {
    setSupplierRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  }

  function updateAdditionalMachine(index: number, field: keyof MachineDraft, value: string) {
    setAdditionalMachines((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value, ...(field === "manufacturer_id" ? { machine_id: "", revision_id: "" } : {}), ...(field === "machine_id" ? { revision_id: value } : {}) } : row));
  }

  async function submit(event: FormEvent, profile: Profile) {
    event.preventDefault(); setSaving(true); setMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const supplierInformation = supplierRows.filter((row) => row.supplier_id).map((row, index) => ({ ...row, preference_rank: index + 1, supplier_name: suppliers.find((supplier) => supplier.id === row.supplier_id)?.name ?? "" }));
    const { data: request, error } = await supabase.from("part_requests").insert({ requested_by: profile.id, status: "draft", machine_manufacturer: machineManufacturer || null, machine_model: machineModel || null, machine_revision: null, machine_revision_ids: additionalMachines.map((row) => row.machine_id).filter(Boolean), part_description: partDescription, part_manufacturer: partManufacturer || null, manufacturer_part_number: manufacturerPartNumber || null, supplier_information: supplierInformation, supply_type: supplyType, compatibility_tags: [], commonly_ordered_part_ids: relatedIds, notes: notes || null }).select("id").single();
    if (error || !request) { setMessage(error?.message ?? "The request could not be created."); setSaving(false); return; }

    for (const [index, prepared] of files.entries()) {
      const file = prepared.file;
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
      <section className="form-card"><div className="detail-card-heading"><h2>Machine compatibility</h2></div><div className="form-grid">
        <label>Machine Manufacturer<select value={machineManufacturerId} onChange={(e) => selectMachineManufacturer(e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Machine Name<select value={machineId} onChange={(e) => selectMachine(e.target.value)} disabled={!machineManufacturerId}><option value="">Select machine</option>{machines.filter((machine) => machine.manufacturer?.id === machineManufacturerId).map((machine) => <option key={machine.id} value={machine.id}>{machine.name ?? machine.model} · {machine.model}</option>)}</select></label>
      </div><div className="additional-machines"><div className="detail-card-heading"><h3>Additional compatible machines</h3><button type="button" className="button secondary compact" onClick={() => setAdditionalMachines((current) => [...current, { manufacturer_id: "", machine_id: "", revision_id: "" }])}>+ Add machine</button></div>{additionalMachines.length ? <div className="machine-link-list">{additionalMachines.map((row, index) => <div className="machine-link-row" key={index}><label>Machine Manufacturer<select value={row.manufacturer_id} onChange={(e) => updateAdditionalMachine(index, "manufacturer_id", e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((manufacturer) => <option key={manufacturer.id} value={manufacturer.id}>{manufacturer.name}</option>)}</select></label><label>Machine Name<select value={row.machine_id} onChange={(e) => updateAdditionalMachine(index, "machine_id", e.target.value)} disabled={!row.manufacturer_id}><option value="">Select machine</option>{machines.filter((machine) => machine.id !== machineId && machine.manufacturer?.id === row.manufacturer_id).map((machine) => <option key={machine.id} value={machine.id}>{machine.name ?? machine.model}</option>)}</select></label><button type="button" className="icon-remove" aria-label="Remove compatible machine" onClick={() => setAdditionalMachines((current) => current.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>)}</div> : <p className="empty-detail">No additional machines added.</p>}</div></section>
      <section className="form-card"><div className="detail-card-heading"><h2>Part information</h2><span>Required fields marked *</span></div><div className="form-grid">
        <label className="span-2">Part Description *<input required value={partDescription} onChange={(e) => setPartDescription(e.target.value)} /></label>
        <label>Part manufacturer<select value={partManufacturer} onChange={(e) => setPartManufacturer(e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
        <label>Part Number Manufacturer<input value={manufacturerPartNumber} onChange={(e) => setManufacturerPartNumber(e.target.value)} /></label>
        <label>Supply type<select value={supplyType} onChange={(e) => setSupplyType(e.target.value)}><option value="unknown">Unknown</option><option value="local">Local supply</option><option value="dfl">DFL</option></select></label>
      </div></section>
      <section className="form-card"><div className="detail-card-heading"><h2>Part supplier information</h2><span>Up to three</span></div><div className="supplier-form-list">{supplierRows.map((row, index) => <div className="supplier-form-row" key={index}><span>{index + 1}</span><label>{index === 0 ? "Part Supplier" : "Additional Supplier"}<select value={row.supplier_id} onChange={(e) => updateSupplier(index, "supplier_id", e.target.value)}><option value="">Not selected</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>{index === 0 ? "Part Number local supplier" : "Supplier part number"}<input value={row.supplier_part_number} onChange={(e) => updateSupplier(index, "supplier_part_number", e.target.value)} /></label><label>Ordering information<input value={row.ordering_information} onChange={(e) => updateSupplier(index, "ordering_information", e.target.value)} /></label></div>)}</div></section>
      <section className="form-card"><div className="detail-card-heading"><h2>Additional information</h2></div><div className="form-grid">
        <label className="span-2">Commonly ordered parts<select multiple value={relatedIds} onChange={(e) => setRelatedIds(Array.from(e.target.selectedOptions, (option) => option.value))}>{parts.map((part) => <option key={part.id} value={part.id}>{part.internal_part_number ?? "No internal number"} · {part.description}</option>)}</select></label>
        <label className="span-2">Notes<textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="span-2 image-picker">Part images<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectImages} disabled={processingImages}/><small>{processingImages ? "Compressing images…" : "Images are resized to 1600 px and compressed to WebP before upload. Maximum 8."}</small></label>
        {files.length > 0 && <div className="upload-preview-grid span-2">{files.map((image, index) => <article key={image.previewUrl}><Image unoptimized width={360} height={270} src={image.previewUrl} alt={`Selected part image ${index + 1}`}/><div><strong>{image.file.name}</strong><small>{formatBytes(image.originalBytes)} → {formatBytes(image.compressedBytes)}</small></div><button type="button" onClick={() => removeImage(index)} aria-label={`Remove ${image.file.name}`}>×</button></article>)}</div>}
      </div></section>
      {message && <p className="form-message">{message}</p>}
      <div className="form-actions"><a className="button secondary" href="/dashboard">Cancel</a><button className="button primary" disabled={saving || processingImages}><PlusIcon/>{saving ? "Submitting…" : "Submit add request"}</button></div>
    </form>
  </main>}</AppShell>;
}
