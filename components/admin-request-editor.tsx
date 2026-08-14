"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell, type Profile } from "./app-shell";
import { ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type SupplierInfo = { supplier_id?: string; supplier_name?: string; supplier_part_number?: string; ordering_information?: string; notes?: string; preference_rank?: number };
type EditableRequest = { id: string; requested_by: string; part_description: string; part_manufacturer: string; manufacturer_part_number: string; machine_manufacturer: string; machine_model: string; machine_revision: string; machine_revision_ids: string[]; supply_type: string; compatibility_tags: string[]; commonly_ordered_part_ids: string[]; supplier_information: SupplierInfo[]; notes: string; review_notes: string; status: string };
type Named = { id: string; name: string };
type MachineOption = { id: string; model: string; name: string | null; manufacturer?: Named | null };
type RevisionOption = { id: string; machine_id: string; revision: string };
type PartOption = { id: string; description: string; internal_part_number: string | null };
type MachineDraft = { machine_id: string; revision_id: string };

export function AdminRequestEditor({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [request, setRequest] = useState<EditableRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [manufacturers, setManufacturers] = useState<Named[]>([]);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [revisions, setRevisions] = useState<RevisionOption[]>([]);
  const [tags, setTags] = useState<Named[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [machineId, setMachineId] = useState("");
  const [additionalMachines, setAdditionalMachines] = useState<MachineDraft[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    Promise.all([
      supabase.from("part_requests").select("*").eq("id", requestId).single(),
      supabase.from("manufacturers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("machines").select("id,model,name,manufacturer:manufacturers(id,name)").eq("is_active", true).order("model"),
      supabase.from("machine_revisions").select("id,machine_id,revision").eq("is_active", true).order("revision"),
      supabase.from("tags").select("id,name").order("name"),
      supabase.from("parts").select("id,description,internal_part_number").eq("status", "active").order("description"),
    ]).then(([requestResult, manufacturerResult, supplierResult, machineResult, revisionResult, tagResult, partResult]) => {
      if (requestResult.error) setMessage(requestResult.error.message); else {
        const loadedRequest = requestResult.data as EditableRequest;
        setRequest(loadedRequest);
        setAdditionalMachines((loadedRequest.machine_revision_ids ?? []).map((revisionId) => ({ machine_id: (revisionResult.data ?? []).find((revision) => revision.id === revisionId)?.machine_id ?? "", revision_id: revisionId })));
      }
      setManufacturers((manufacturerResult.data ?? []) as Named[]); setSuppliers((supplierResult.data ?? []) as Named[]);
      setMachines((machineResult.data ?? []) as unknown as MachineOption[]); setRevisions((revisionResult.data ?? []) as RevisionOption[]);
      setTags((tagResult.data ?? []) as Named[]); setParts((partResult.data ?? []) as PartOption[]);
    });
  }, [requestId]);
  function field(name: keyof EditableRequest, value: string) { setRequest((current) => current ? { ...current, [name]: value } : current); }
  function selectMachine(id: string) { setMachineId(id); const machine = machines.find((item) => item.id === id); if (machine) setRequest((current) => current ? { ...current, machine_manufacturer: machine.manufacturer?.name ?? "", machine_model: machine.model, machine_revision: "" } : current); }
  function updateSupplier(index: number, name: keyof SupplierInfo, value: string) { setRequest((current) => current ? { ...current, supplier_information: Array.from({ length: 3 }, (_, rowIndex) => ({ ...(current.supplier_information?.[rowIndex] ?? { preference_rank: rowIndex + 1 }), ...(rowIndex === index ? { [name]: value, ...(name === "supplier_id" ? { supplier_name: suppliers.find((supplier) => supplier.id === value)?.name ?? "" } : {}) } : {}) })) } : current); }
  function setMachineRows(rows: MachineDraft[]) { setAdditionalMachines(rows); setRequest((current) => current ? { ...current, machine_revision_ids: rows.map((row) => row.revision_id).filter(Boolean) } : current); }
  function updateAdditionalMachine(index: number, name: keyof MachineDraft, value: string) { setMachineRows(additionalMachines.map((row, rowIndex) => rowIndex === index ? { ...row, [name]: value, ...(name === "machine_id" ? { revision_id: "" } : {}) } : row)); }

  async function save(event?: FormEvent) {
    event?.preventDefault(); if (!request) return false; setSaving(true); setMessage("");
    const supabase = getSupabaseBrowserClient(); if (!supabase) return false;
    const { error } = await supabase.from("part_requests").update({ part_description: request.part_description, part_manufacturer: request.part_manufacturer || null, manufacturer_part_number: request.manufacturer_part_number || null, machine_manufacturer: request.machine_manufacturer || null, machine_model: request.machine_model || null, machine_revision: request.machine_revision || null, machine_revision_ids: request.machine_revision_ids ?? [], supply_type: request.supply_type, compatibility_tags: request.compatibility_tags ?? [], commonly_ordered_part_ids: request.commonly_ordered_part_ids ?? [], supplier_information: (request.supplier_information ?? []).filter((supplier) => supplier.supplier_id || supplier.supplier_name), notes: request.notes || null, review_notes: request.review_notes || null }).eq("id", request.id);
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
    if (request.compatibility_tags?.length) {
      const { data: tagRows } = await supabase.from("tags").select("id,name").in("name", request.compatibility_tags);
      if (tagRows?.length) await supabase.from("part_tags").insert(tagRows.map((tag) => ({ part_id: createdPart.data.id, tag_id: tag.id })));
    }
    if (request.machine_revision_ids?.length) await supabase.from("part_machine_revisions").upsert(request.machine_revision_ids.map((machine_revision_id) => ({ part_id: createdPart.data.id, machine_revision_id })), { onConflict: "part_id,machine_revision_id" });

    if (request.machine_manufacturer && request.machine_model) {
      let machineManufacturerId: string | null = null;
      const existingMfr = await supabase.from("manufacturers").select("id").ilike("name", request.machine_manufacturer).limit(1).maybeSingle();
      if (existingMfr.data) machineManufacturerId = existingMfr.data.id; else { const created = await supabase.from("manufacturers").insert({ name: request.machine_manufacturer }).select("id").single(); machineManufacturerId = created.data?.id ?? null; }
      if (machineManufacturerId) {
        let machineId: string | null = null;
        const existingMachine = await supabase.from("machines").select("id").eq("manufacturer_id", machineManufacturerId).ilike("model", request.machine_model).limit(1).maybeSingle();
        if (existingMachine.data) machineId = existingMachine.data.id; else { const created = await supabase.from("machines").insert({ manufacturer_id: machineManufacturerId, model: request.machine_model }).select("id").single(); machineId = created.data?.id ?? null; }
        if (machineId && request.machine_revision) {
          let revisionId: string | null = null; const existingRevision = await supabase.from("machine_revisions").select("id").eq("machine_id", machineId).ilike("revision", request.machine_revision).limit(1).maybeSingle();
          if (existingRevision.data) revisionId = existingRevision.data.id; else { const created = await supabase.from("machine_revisions").insert({ machine_id: machineId, revision: request.machine_revision }).select("id").single(); revisionId = created.data?.id ?? null; }
          if (revisionId) await supabase.from("part_machine_revisions").upsert({ part_id: createdPart.data.id, machine_revision_id: revisionId }, { onConflict: "part_id,machine_revision_id" });
        }
      }
    }

    const finished = await supabase.from("part_requests").update({ status: "approved", approved_part_id: createdPart.data.id, reviewed_by: profile.id, reviewed_at: new Date().toISOString(), review_notes: request.review_notes || null }).eq("id", request.id);
    if (finished.error) { setMessage(finished.error.message); setSaving(false); } else router.push(`/parts/${createdPart.data.id}`);
  }

  return <AppShell requireAdmin>{(profile) => <main className="workspace form-workspace"><a className="back-link" href="/admin">← Back to admin requests</a>{!request ? <section className="detail-state"><div className="spinner"/><p>{message || "Loading request…"}</p></section> : <><section className="workspace-heading"><div><p className="eyebrow accent">Administrator review</p><h1>{request.part_description}</h1><p>Validate submitted information against controlled database values before approval.</p></div><span className="admin-badge"><ShieldIcon/>{request.status}</span></section><form className="record-form" onSubmit={save}>
    <section className="form-card"><div className="detail-card-heading"><h2>Machine information</h2><span>Multiple machines supported</span></div><div className="form-grid"><label className="span-2">Machine Name<select value={machineId} onChange={(e) => selectMachine(e.target.value)}><option value="">Match an existing machine</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name ?? machine.model} · {machine.model}</option>)}</select></label><label>Machine Rev<select value={request.machine_revision ?? ""} onChange={(e) => field("machine_revision", e.target.value)}><option value="">Select revision</option>{revisions.filter((item) => !machineId || item.machine_id === machineId).map((item) => <option key={item.id} value={item.revision}>{item.revision}</option>)}</select></label><label>Machine Manufacturer<select value={request.machine_manufacturer ?? ""} onChange={(e) => field("machine_manufacturer", e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label>Compatibility tags<select multiple value={request.compatibility_tags ?? []} onChange={(e) => setRequest({ ...request, compatibility_tags: Array.from(e.target.selectedOptions, (option) => option.value) })}>{tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}</select></label></div><div className="additional-machines"><div className="detail-card-heading"><h3>Additional compatible machines</h3><button type="button" className="button secondary compact" onClick={() => setMachineRows([...additionalMachines, { machine_id: "", revision_id: "" }])}>+ Add machine</button></div>{additionalMachines.length ? <div className="machine-link-list">{additionalMachines.map((row, index) => <div className="machine-link-row" key={index}><label>Machine Name<select value={row.machine_id} onChange={(e) => updateAdditionalMachine(index, "machine_id", e.target.value)}><option value="">Select machine</option>{machines.filter((machine) => machine.id !== machineId).map((machine) => <option key={machine.id} value={machine.id}>{machine.manufacturer?.name} · {machine.name ?? machine.model}</option>)}</select></label><label>Machine Rev<select value={row.revision_id} onChange={(e) => updateAdditionalMachine(index, "revision_id", e.target.value)} disabled={!row.machine_id}><option value="">Select revision</option>{revisions.filter((revision) => revision.machine_id === row.machine_id).map((revision) => <option key={revision.id} value={revision.id}>{revision.revision}</option>)}</select></label><button type="button" className="icon-remove" aria-label="Remove compatible machine" onClick={() => setMachineRows(additionalMachines.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>)}</div> : <p className="empty-detail">No additional machines added.</p>}</div></section>
    <section className="form-card"><div className="detail-card-heading"><h2>Part information</h2><span>Database linked</span></div><div className="form-grid"><label className="span-2">Part Description *<input required value={request.part_description} onChange={(e) => field("part_description", e.target.value)}/></label><label>Part manufacturer<select value={request.part_manufacturer ?? ""} onChange={(e) => field("part_manufacturer", e.target.value)}><option value="">Select manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label>Part Number Manufacturer<input value={request.manufacturer_part_number ?? ""} onChange={(e) => field("manufacturer_part_number", e.target.value)}/></label><label>Supply type<select value={request.supply_type} onChange={(e) => field("supply_type", e.target.value)}><option value="unknown">Unknown</option><option value="local">Local</option><option value="dfl">DFL</option></select></label></div></section>
    <section className="form-card"><div className="detail-card-heading"><h2>Part supplier information</h2><span>Database linked · up to three</span></div><div className="supplier-form-list">{Array.from({ length: 3 }, (_, index) => request.supplier_information?.[index] ?? { preference_rank: index + 1 }).map((supplier, index) => <div className="supplier-form-row" key={index}><span>{index + 1}</span><label>{index === 0 ? "Part Supplier" : "Additional Supplier"}<select value={supplier.supplier_id ?? ""} onChange={(e) => updateSupplier(index, "supplier_id", e.target.value)}><option value="">Not selected</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{index === 0 ? "Part Number local supplier" : "Supplier part number"}<input value={supplier.supplier_part_number ?? ""} onChange={(e) => updateSupplier(index, "supplier_part_number", e.target.value)}/></label><label>Ordering information<input value={supplier.ordering_information ?? ""} onChange={(e) => updateSupplier(index, "ordering_information", e.target.value)}/></label></div>)}</div></section>
    <section className="form-card"><div className="detail-card-heading"><h2>Related information</h2><span>Database linked</span></div><div className="form-grid"><label className="span-2">Commonly ordered parts<select multiple value={request.commonly_ordered_part_ids ?? []} onChange={(e) => setRequest({ ...request, commonly_ordered_part_ids: Array.from(e.target.selectedOptions, (option) => option.value) })}>{parts.map((part) => <option key={part.id} value={part.id}>{part.internal_part_number ?? "No internal number"} · {part.description}</option>)}</select></label><label className="span-2">Part notes<textarea rows={5} value={request.notes ?? ""} onChange={(e) => field("notes", e.target.value)}/></label><label className="span-2">Administrator review notes<textarea rows={4} value={request.review_notes ?? ""} onChange={(e) => field("review_notes", e.target.value)}/></label></div></section>
    {message && <p className="form-message success-message">{message}</p>}<div className="form-actions admin-actions"><button type="button" className="button danger" disabled={saving} onClick={() => reject(profile)}>Reject request</button><button className="button secondary" disabled={saving}>Save changes</button><button type="button" className="button primary" disabled={saving} onClick={() => approve(profile)}>{saving ? "Processing…" : "Approve & add to database"}</button></div></form></>}</main>}</AppShell>;
}
