"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell, type Profile } from "./app-shell";
import { ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type SupplierInfo = { supplier_id?: string; supplier_name?: string; supplier_part_number?: string; ordering_information?: string; notes?: string; preference_rank?: number };
type EditableRequest = { id: string; requested_by: string; part_description: string; part_manufacturer: string; manufacturer_part_number: string; machine_manufacturer: string; machine_model: string; machine_revision: string; supply_type: string; compatibility_tags: string[]; commonly_ordered_part_ids: string[]; supplier_information: SupplierInfo[]; notes: string; review_notes: string; status: string };

export function AdminRequestEditor({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [request, setRequest] = useState<EditableRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { getSupabaseBrowserClient()?.from("part_requests").select("*").eq("id", requestId).single().then(({ data, error }) => { if (error) setMessage(error.message); else setRequest(data as EditableRequest); }); }, [requestId]);
  function field(name: keyof EditableRequest, value: string) { setRequest((current) => current ? { ...current, [name]: value } : current); }

  async function save(event?: FormEvent) {
    event?.preventDefault(); if (!request) return false; setSaving(true); setMessage("");
    const supabase = getSupabaseBrowserClient(); if (!supabase) return false;
    const { error } = await supabase.from("part_requests").update({ part_description: request.part_description, part_manufacturer: request.part_manufacturer || null, manufacturer_part_number: request.manufacturer_part_number || null, machine_manufacturer: request.machine_manufacturer || null, machine_model: request.machine_model || null, machine_revision: request.machine_revision || null, supply_type: request.supply_type, notes: request.notes || null, review_notes: request.review_notes || null }).eq("id", request.id);
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
          if (revisionId) await supabase.from("part_machine_revisions").insert({ part_id: createdPart.data.id, machine_revision_id: revisionId });
        }
      }
    }

    const finished = await supabase.from("part_requests").update({ status: "approved", approved_part_id: createdPart.data.id, reviewed_by: profile.id, reviewed_at: new Date().toISOString(), review_notes: request.review_notes || null }).eq("id", request.id);
    if (finished.error) { setMessage(finished.error.message); setSaving(false); } else router.push(`/parts/${createdPart.data.id}`);
  }

  return <AppShell requireAdmin>{(profile) => <main className="workspace form-workspace"><a className="back-link" href="/admin">← Back to admin requests</a>{!request ? <section className="detail-state"><div className="spinner"/><p>{message || "Loading request…"}</p></section> : <><section className="workspace-heading"><div><p className="eyebrow accent">Administrator review</p><h1>{request.part_description}</h1><p>Edit and validate the submitted information before adding it to the database.</p></div><span className="admin-badge"><ShieldIcon/>{request.status}</span></section><form className="record-form" onSubmit={save}><section className="form-card"><div className="detail-card-heading"><h2>Part and machine information</h2></div><div className="form-grid"><label className="span-2">Part description *<input required value={request.part_description} onChange={(e) => field("part_description", e.target.value)}/></label><label>Part manufacturer<input value={request.part_manufacturer ?? ""} onChange={(e) => field("part_manufacturer", e.target.value)}/></label><label>Manufacturer part number<input value={request.manufacturer_part_number ?? ""} onChange={(e) => field("manufacturer_part_number", e.target.value)}/></label><label>Machine manufacturer<input value={request.machine_manufacturer ?? ""} onChange={(e) => field("machine_manufacturer", e.target.value)}/></label><label>Machine model<input value={request.machine_model ?? ""} onChange={(e) => field("machine_model", e.target.value)}/></label><label>Machine revision<input value={request.machine_revision ?? ""} onChange={(e) => field("machine_revision", e.target.value)}/></label><label>Supply type<select value={request.supply_type} onChange={(e) => field("supply_type", e.target.value)}><option value="unknown">Unknown</option><option value="local">Local</option><option value="dfl">DFL</option></select></label><label className="span-2">Part notes<textarea rows={5} value={request.notes ?? ""} onChange={(e) => field("notes", e.target.value)}/></label><label className="span-2">Administrator review notes<textarea rows={4} value={request.review_notes ?? ""} onChange={(e) => field("review_notes", e.target.value)}/></label></div></section>{message && <p className="form-message success-message">{message}</p>}<div className="form-actions admin-actions"><button type="button" className="button danger" disabled={saving} onClick={() => reject(profile)}>Reject request</button><button className="button secondary" disabled={saving}>Save changes</button><button type="button" className="button primary" disabled={saving} onClick={() => approve(profile)}>{saving ? "Processing…" : "Approve & add to database"}</button></div></form></>}</main>}</AppShell>;
}
