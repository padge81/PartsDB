"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AppShell, type Profile } from "./app-shell";
import { ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { useSupplyTypes } from "../lib/use-supply-types";

type SupplierInfo = { supplier_id?: string; supplier_name?: string; supplier_part_number?: string; ordering_information?: string; notes?: string; preference_rank?: number };
type EditableRequest = { id: string; requested_by: string; part_description: string; part_manufacturer: string; manufacturer_part_number: string; machine_manufacturer: string; machine_name: string; machine_model: string; machine_revision: string; machine_revision_ids: string[]; supply_type: string; compatibility_tags: string[]; commonly_ordered_part_ids: string[]; supplier_information: SupplierInfo[]; notes: string; review_notes: string; status: string };
type Named = { id: string; name: string };
type MachineOption = { id: string; model: string | null; name: string; manufacturer?: Named | null };
type PartOption = { id: string; description: string; internal_part_number: string | null };
type MachineDraft = { manufacturer_id: string; machine_id: string; revision_id: string };
type RequestImage = { id: string; storage_path: string; kind: string; sort_order: number; signedUrl?: string };

export function AdminRequestEditor({ requestId }: { requestId: string }) {
  const supplyTypes = useSupplyTypes();
  const router = useRouter();
  const [request, setRequest] = useState<EditableRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [manufacturers, setManufacturers] = useState<Named[]>([]);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [machineId, setMachineId] = useState("");
  const [machineManufacturerId, setMachineManufacturerId] = useState("");
  const [additionalMachines, setAdditionalMachines] = useState<MachineDraft[]>([]);
  const [requestImages, setRequestImages] = useState<RequestImage[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    Promise.all([
      supabase.from("part_requests").select("*").eq("id", requestId).single(),
      supabase.from("manufacturers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("machines").select("id,model,name,manufacturer:manufacturers(id,name)").eq("is_active", true).order("name"),
      supabase.from("machine_revisions").select("id,machine_id,revision").eq("is_active", true).order("revision"),
      supabase.from("parts").select("id,description,internal_part_number").eq("status", "active").order("description"),
      supabase.from("request_images").select("id,storage_path,kind,sort_order").eq("request_id", requestId).order("sort_order"),
    ]).then(async ([requestResult, manufacturerResult, supplierResult, machineResult, revisionResult, partResult, imageResult]) => {
      if (requestResult.error) setMessage(requestResult.error.message); else {
        const loadedRequest = requestResult.data as EditableRequest;
        setRequest(loadedRequest);
        const loadedManufacturerId = (manufacturerResult.data ?? []).find((manufacturer) => manufacturer.name === loadedRequest.machine_manufacturer)?.id ?? "";
        setMachineManufacturerId(loadedManufacturerId);
        setMachineId(((machineResult.data ?? []) as unknown as MachineOption[]).find((machine) => machine.manufacturer?.id === loadedManufacturerId && machine.name === (loadedRequest.machine_name || loadedRequest.machine_model))?.id ?? "");
        setAdditionalMachines((loadedRequest.machine_revision_ids ?? []).map((compatibilityId) => { const legacyRevision = (revisionResult.data ?? []).find((revision) => revision.id === compatibilityId); const machine_id = legacyRevision?.machine_id ?? (((machineResult.data ?? []) as unknown as MachineOption[]).some((machine) => machine.id === compatibilityId) ? compatibilityId : ""); const machine = ((machineResult.data ?? []) as unknown as MachineOption[]).find((item) => item.id === machine_id); return { manufacturer_id: machine?.manufacturer?.id ?? "", machine_id, revision_id: compatibilityId }; }));
      }
      setManufacturers((manufacturerResult.data ?? []) as Named[]); setSuppliers((supplierResult.data ?? []) as Named[]);
      setMachines((machineResult.data ?? []) as unknown as MachineOption[]); setParts((partResult.data ?? []) as PartOption[]);
      if (imageResult.data?.length) { const rows = imageResult.data as RequestImage[]; const { data: signed } = await supabase.storage.from("request-images").createSignedUrls(rows.map((image) => image.storage_path), 3600); setRequestImages(rows.map((image, index) => ({ ...image, signedUrl: signed?.[index]?.signedUrl }))); }
    });
  }, [requestId]);
  function field(name: keyof EditableRequest, value: string) { setRequest((current) => current ? { ...current, [name]: value } : current); }
  function selectMachine(id: string) { setMachineId(id); const machine = machines.find((item) => item.id === id); if (machine) setRequest((current) => current ? { ...current, machine_manufacturer: machine.manufacturer?.name ?? "", machine_name: machine.name, machine_model: machine.model ?? "", machine_revision: "" } : current); }
  function selectMachineManufacturer(id: string) { setMachineManufacturerId(id); setMachineId(""); setRequest((current) => current ? { ...current, machine_manufacturer: manufacturers.find((item) => item.id === id)?.name ?? "", machine_name: "", machine_model: "", machine_revision: "" } : current); }
  function updateSupplier(index: number, name: keyof SupplierInfo, value: string) { setRequest((current) => current ? { ...current, supplier_information: Array.from({ length: 3 }, (_, rowIndex) => ({ ...(current.supplier_information?.[rowIndex] ?? { preference_rank: rowIndex + 1 }), ...(rowIndex === index ? { [name]: value, ...(name === "supplier_id" ? { supplier_name: suppliers.find((supplier) => supplier.id === value)?.name ?? "" } : {}) } : {}) })) } : current); }
  function setMachineRows(rows: MachineDraft[]) { setAdditionalMachines(rows); setRequest((current) => current ? { ...current, machine_revision_ids: rows.map((row) => row.revision_id).filter(Boolean) } : current); }
  function updateAdditionalMachine(index: number, name: keyof MachineDraft, value: string) { setMachineRows(additionalMachines.map((row, rowIndex) => rowIndex === index ? { ...row, [name]: value, ...(name === "manufacturer_id" ? { machine_id: "", revision_id: "" } : {}), ...(name === "machine_id" ? { revision_id: value } : {}) } : row)); }

  async function save(event?: FormEvent) {
    event?.preventDefault(); if (!request) return false; setSaving(true); setMessage("");
    const supabase = getSupabaseBrowserClient(); if (!supabase) return false;
    const { error } = await supabase.from("part_requests").update({ part_description: request.part_description, part_manufacturer: request.part_manufacturer || null, manufacturer_part_number: request.manufacturer_part_number || null, machine_manufacturer: request.machine_manufacturer || null, machine_name: request.machine_name || null, machine_model: request.machine_model || null, machine_revision: null, machine_revision_ids: request.machine_revision_ids ?? [], supply_type: request.supply_type, compatibility_tags: [], commonly_ordered_part_ids: request.commonly_ordered_part_ids ?? [], supplier_information: (request.supplier_information ?? []).filter((supplier) => supplier.supplier_id || supplier.supplier_name), notes: request.notes || null, review_notes: request.review_notes || null }).eq("id", request.id);
    setSaving(false); if (error) { setMessage(error.message); return false; } setMessage("Request changes saved."); return true;
  }

  async function reject(profile: Profile) {
    if (!request) return; setSaving(true); const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error } = await supabase.from("part_requests").update({ status: "rejected", reviewed_by: profile.id, reviewed_at: new Date().toISOString(), review_notes: request.review_notes || "Rejected by administrator" }).eq("id", request.id);
    if (error) { setMessage(error.message); setSaving(false); } else router.push("/admin");
  }

  async function approve(profile: Profile) {
    if (!request) return; setSaving(true); setMessage(""); const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    await save();
    let manufacturerId: string | null = null;
    if (request.part_manufacturer) {
      const existing = await supabase.from("manufacturers").select("id").ilike("name", request.part_manufacturer).limit(1).maybeSingle();
      if (existing.data) manufacturerId = existing.data.id;
      else { const created = await supabase.from("manufacturers").insert({ name: request.part_manufacturer }).select("id").single(); if (created.error) { setMessage(created.error.message); setSaving(false); return; } manufacturerId = created.data.id; }
    }
    const createdPart = await supabase.from("parts").insert({ description: request.part_description, manufacturer_id: manufacturerId, manufacturer_part_number: request.manufacturer_part_number || null, notes: request.notes || null, supply_type: request.supply_type, status: "active", created_by: profile.id, updated_by: profile.id }).select("id").single();
    if (createdPart.error) { setMessage(createdPart.error.message); setSaving(false); return; }

    for (const supplier of request.supplier_information ?? []) {
      let supplierId = supplier.supplier_id;
      if (!supplierId && supplier.supplier_name) {
        const existing = await supabase.from("suppliers").select("id").ilike("name", supplier.supplier_name).limit(1).maybeSingle();
        if (existing.data) supplierId = existing.data.id;
        else { const created = await supabase.from("suppliers").insert({ name: supplier.supplier_name }).select("id").single(); supplierId = created.data?.id; }
      }
      if (supplierId) await supabase.from("part_suppliers").insert({ part_id: createdPart.data.id, supplier_id: supplierId, preference_rank: supplier.preference_rank ?? 1, supplier_part_number: supplier.supplier_part_number || null, ordering_information: supplier.ordering_information || null, notes: supplier.notes || null });
    }

    if (request.commonly_ordered_part_ids?.length) await supabase.from("commonly_ordered_parts").insert(request.commonly_ordered_part_ids.map((related_part_id) => ({ part_id: createdPart.data.id, related_part_id, created_by: profile.id })));
    for (const [index, image] of requestImages.entries()) {
      const downloaded = await supabase.storage.from("request-images").download(image.storage_path);
      if (downloaded.error || !downloaded.data) { setMessage(`Part created, but image ${index + 1} could not be copied: ${downloaded.error?.message ?? "download failed"}`); setSaving(false); return; }
      const targetPath = `${createdPart.data.id}/${crypto.randomUUID()}.webp`;
      const uploaded = await supabase.storage.from("part-images").upload(targetPath, downloaded.data, { contentType: downloaded.data.type || "image/webp" });
      if (uploaded.error) { setMessage(`Part created, but image ${index + 1} could not be stored: ${uploaded.error.message}`); setSaving(false); return; }
      const imageRow = await supabase.from("part_images").insert({ part_id: createdPart.data.id, storage_path: targetPath, uploaded_by: profile.id, kind: image.kind || "other", sort_order: index });
      if (imageRow.error) { setMessage(`Part created, but image ${index + 1} could not be linked: ${imageRow.error.message}`); setSaving(false); return; }
    }
    for (const compatibilityId of request.machine_revision_ids ?? []) {
      const legacyRevision = await supabase.from("machine_revisions").select("id").eq("id", compatibilityId).maybeSingle();
      let revisionId = legacyRevision.data?.id ?? null;
      if (!revisionId) {
        const existingRevision = await supabase.from("machine_revisions").select("id").eq("machine_id", compatibilityId).eq("is_active", true).limit(1).maybeSingle();
        revisionId = existingRevision.data?.id ?? null;
        if (!revisionId) {
          const createdRevision = await supabase.from("machine_revisions").insert({ machine_id: compatibilityId, revision: "Default" }).select("id").single();
          revisionId = createdRevision.data?.id ?? null;
        }
      }
      if (revisionId) await supabase.from("part_machine_revisions").upsert({ part_id: createdPart.data.id, machine_revision_id: revisionId }, { onConflict: "part_id,machine_revision_id" });
    }

    if (request.machine_manufacturer && request.machine_name) {
      let machineManufacturerId: string | null = null;
      const existingMfr = await supabase.from("manufacturers").select("id").ilike("name", request.machine_manufacturer).limit(1).maybeSingle();
      if (existingMfr.data) machineManufacturerId = existingMfr.data.id; else { const created = await supabase.from("manufacturers").insert({ name: request.machine_manufacturer }).select("id").single(); machineManufacturerId = created.data?.id ?? null; }
      if (machineManufacturerId) {
        let machineId: string | null = null;
        const existingMachine = await supabase.from("machines").select("id").eq("manufacturer_id", machineManufacturerId).ilike("name", request.machine_name).limit(1).maybeSingle();
        if (existingMachine.data) machineId = existingMachine.data.id; else { const created = await supabase.from("machines").insert({ manufacturer_id: machineManufacturerId, name: request.machine_name, model: request.machine_model || null }).select("id").single(); machineId = created.data?.id ?? null; }
        if (machineId) {
          let revisionId: string | null = null; const existingRevision = await supabase.from("machine_revisions").select("id").eq("machine_id", machineId).eq("is_active", true).limit(1).maybeSingle();
          if (existingRevision.data) revisionId = existingRevision.data.id; else { const created = await supabase.from("machine_revisions").insert({ machine_id: machineId, revision: "Default" }).select("id").single(); revisionId = created.data?.id ?? null; }
          if (revisionId) await supabase.from("part_machine_revisions").upsert({ part_id: createdPart.data.id, machine_revision_id: revisionId }, { onConflict: "part_id,machine_revision_id" });
        }
      }
    }

    const finished = await supabase.from("part_requests").update({ status: "approved", approved_part_id: createdPart.data.id, reviewed_by: profile.id, reviewed_at: new Date().toISOString(), review_notes: request.review_notes || null }).eq("id", request.id);
    if (finished.error) { setMessage(finished.error.message); setSaving(false); } else router.push(`/parts/${createdPart.data.id}`);
  }

  return <AppShell requireAdmin>{(profile) => <main className="workspace form-workspace"><a className="back-link" href="/admin">← Back to admin requests</a>{!request ? <section className="detail-state"><div className="spinner"/><p>{message || "Loading request…"}</p></section> : <><section className="workspace-heading"><div><p className="eyebrow accent">Administrator review</p><h1>{request.part_description}</h1><p>Validate submitted information against controlled database values before approval.</p></div><span className="admin-badge"><ShieldIcon/>{request.status}</span></section><form className="record-form" onSubmit={save}>
    <section className="form-card"><div className="detail-card-heading"><h2>Machine information</h2><span>Multiple machines supported</span></div><div className="form-grid"><label>Machine Manufacturer<select value={machineManufacturerId} onChange={(e) => selectMachineManufacturer(e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Machine Name<select value={machineId} onChange={(e) => selectMachine(e.target.value)} disabled={!machineManufacturerId}><option value="">Select machine</option>{machines.filter((machine) => machine.manufacturer?.id === machineManufacturerId).map((machine) => <option key={machine.id} value={machine.id}>{machine.name ?? machine.model} · {machine.model}</option>)}</select></label></div><div className="additional-machines"><div className="detail-card-heading"><h3>Additional compatible machines</h3><button type="button" className="button secondary compact" onClick={() => setMachineRows([...additionalMachines, { manufacturer_id: "", machine_id: "", revision_id: "" }])}>+ Add machine</button></div>{additionalMachines.length ? <div className="machine-link-list">{additionalMachines.map((row, index) => <div className="machine-link-row" key={index}><label>Machine Manufacturer<select value={row.manufacturer_id} onChange={(e) => updateAdditionalMachine(index, "manufacturer_id", e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((manufacturer) => <option key={manufacturer.id} value={manufacturer.id}>{manufacturer.name}</option>)}</select></label><label>Machine Name<select value={row.machine_id} onChange={(e) => updateAdditionalMachine(index, "machine_id", e.target.value)} disabled={!row.manufacturer_id}><option value="">Select machine</option>{machines.filter((machine) => machine.id !== machineId && machine.manufacturer?.id === row.manufacturer_id).map((machine) => <option key={machine.id} value={machine.id}>{machine.name ?? machine.model}</option>)}</select></label><button type="button" className="icon-remove" aria-label="Remove compatible machine" onClick={() => setMachineRows(additionalMachines.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>)}</div> : <p className="empty-detail">No additional machines added.</p>}</div></section>
    <section className="form-card"><div className="detail-card-heading"><h2>Part information</h2><span>Database linked</span></div><div className="form-grid"><label className="span-2">Part Description *<input required value={request.part_description} onChange={(e) => field("part_description", e.target.value)}/></label><label>Part manufacturer<select value={request.part_manufacturer ?? ""} onChange={(e) => field("part_manufacturer", e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label>Part Number Manufacturer<input value={request.manufacturer_part_number ?? ""} onChange={(e) => field("manufacturer_part_number", e.target.value)}/></label><label>Supply type<select value={request.supply_type} onChange={(e) => field("supply_type", e.target.value)}>{supplyTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label></div></section>
    <section className="form-card"><div className="detail-card-heading"><h2>Part supplier information</h2><span>Database linked · up to three</span></div><div className="supplier-form-list">{Array.from({ length: 3 }, (_, index) => request.supplier_information?.[index] ?? { preference_rank: index + 1 }).map((supplier, index) => <div className="supplier-form-row" key={index}><span>{index + 1}</span><label>{index === 0 ? "Part Supplier" : "Additional Supplier"}<select value={supplier.supplier_id ?? ""} onChange={(e) => updateSupplier(index, "supplier_id", e.target.value)}><option value="">Not selected</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{index === 0 ? "Part Number local supplier" : "Supplier part number"}<input value={supplier.supplier_part_number ?? ""} onChange={(e) => updateSupplier(index, "supplier_part_number", e.target.value)}/></label><label>Ordering information<input value={supplier.ordering_information ?? ""} onChange={(e) => updateSupplier(index, "ordering_information", e.target.value)}/></label></div>)}</div></section>
    <section className="form-card"><div className="detail-card-heading"><h2>Submitted images</h2><span>{requestImages.length}</span></div>{requestImages.length ? <div className="review-image-grid">{requestImages.map((image, index) => image.signedUrl ? <a href={image.signedUrl} target="_blank" rel="noreferrer" key={image.id}><Image unoptimized width={360} height={270} src={image.signedUrl} alt={`Submitted part image ${index + 1}`}/><span>Image {index + 1} · open full size</span></a> : null)}</div> : <p className="empty-detail">No images were submitted.</p>}</section>
    <section className="form-card"><div className="detail-card-heading"><h2>Related information</h2><span>Database linked</span></div><div className="form-grid"><label className="span-2">Commonly ordered parts<select multiple value={request.commonly_ordered_part_ids ?? []} onChange={(e) => setRequest({ ...request, commonly_ordered_part_ids: Array.from(e.target.selectedOptions, (option) => option.value) })}>{parts.map((part) => <option key={part.id} value={part.id}>{part.internal_part_number ?? "No internal number"} · {part.description}</option>)}</select></label><label className="span-2">Part notes<textarea rows={5} value={request.notes ?? ""} onChange={(e) => field("notes", e.target.value)}/></label><label className="span-2">Administrator review notes<textarea rows={4} value={request.review_notes ?? ""} onChange={(e) => field("review_notes", e.target.value)}/></label></div></section>
    {message && <p className="form-message success-message">{message}</p>}<div className="form-actions admin-actions"><button type="button" className="button danger" disabled={saving} onClick={() => reject(profile)}>Reject request</button><button className="button secondary" disabled={saving}>Save changes</button><button type="button" className="button primary" disabled={saving} onClick={() => approve(profile)}>{saving ? "Processing…" : "Approve & add to database"}</button></div></form></>}</main>}</AppShell>;
}
