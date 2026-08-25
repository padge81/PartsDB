"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AppShell } from "./app-shell";
import { ArrowIcon, BoxIcon, CopyIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { useSupplyTypes } from "../lib/use-supply-types";
import { AddToBomButton } from "./add-to-bom-button";

type PartRecord = {
  id: string;
  description: string;
  manufacturer_part_number: string | null;
  notes: string | null;
  supply_type: string;
  status: string;
  manufacturer?: { name: string } | null;
};

type SupplierRow = {
  preference_rank: number;
  supplier_part_number: string | null;
  ordering_information: string | null;
  notes: string | null;
  supplier?: { name: string; website_url: string | null; ordering_information: string | null } | null;
};

type CompatibilityRow = {
  notes: string | null;
  machine?: { model: string; name: string | null; manufacturer?: { name: string } | null } | null;
};

type ImageRow = { id: string; storage_path: string; caption: string | null; kind: string; signedUrl?: string };
type RelatedPart = { id: string; description: string; manufacturer_part_number: string | null };

const demoParts: Record<string, PartRecord> = {
  "1": { id: "1", description: "Sealed deep groove ball bearing", manufacturer_part_number: "6204-2RSH", notes: "Sealed bearing for high-speed conveyor drive assemblies. Confirm shaft condition before replacement.", supply_type: "local", status: "active", manufacturer: { name: "SKF" } },
  "2": { id: "2", description: "Photoelectric diffuse sensor, 300 mm", manufacturer_part_number: "WTB4-3P2161", notes: "PNP switching output with M8 connector. Record alignment after installation.", supply_type: "dfl", status: "active", manufacturer: { name: "SICK" } },
  "3": { id: "3", description: "Timing belt, 25 mm width", manufacturer_part_number: "HTD-800-8M-25", notes: "Inspect both pulleys and tensioner when replacing the belt.", supply_type: "local", status: "active", manufacturer: { name: "Gates" } },
  "4": { id: "4", description: "Pneumatic solenoid valve 5/2 way", manufacturer_part_number: "VUVG-L14-M52", notes: "24 VDC valve used on pneumatic actuator manifolds.", supply_type: "dfl", status: "active", manufacturer: { name: "Festo" } },
};

export function PartDetails({ partId }: { partId: string }) {
  const supplyTypes = useSupplyTypes();
  const [part, setPart] = useState<PartRecord | null>(demoParts[partId] ?? null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [compatibility, setCompatibility] = useState<CompatibilityRow[]>([]);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [related, setRelated] = useState<RelatedPart[]>([]);
  const [loading, setLoading] = useState(!demoParts[partId]);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState<ImageRow | null>(null);
  const [copiedField, setCopiedField] = useState("");

  async function copyValue(field: string, value: string) {
    await navigator.clipboard.writeText(value); setCopiedField(field); window.setTimeout(() => setCopiedField(""), 1200);
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    async function loadPart() {
      const [partResult, supplierResult, compatibilityResult, imageResult, relationshipResult] = await Promise.all([
        supabase!.from("parts").select("id, description, manufacturer_part_number, notes, supply_type, status, manufacturer:companies(name)").eq("id", partId).single(),
        supabase!.from("part_suppliers").select("preference_rank, supplier_part_number, ordering_information, notes, supplier:companies(name, website_url, ordering_information)").eq("part_id", partId).eq("is_active", true).order("preference_rank"),
        supabase!.from("part_machines").select("notes, machine:machines(model, name, manufacturer:companies(name))").eq("part_id", partId),
        supabase!.from("part_images").select("id, storage_path, caption, kind").eq("part_id", partId).order("sort_order"),
        supabase!.from("part_order_group_members").select("group_id").eq("part_id", partId).maybeSingle(),
      ]);

      if (partResult.error || !partResult.data) {
        if (!demoParts[partId]) setError("This part could not be found or is not available to your account.");
        setLoading(false);
        return;
      }

      setPart(partResult.data as unknown as PartRecord);
      if (supplierResult.data) setSuppliers(supplierResult.data as unknown as SupplierRow[]);
      if (compatibilityResult.data) setCompatibility(compatibilityResult.data as unknown as CompatibilityRow[]);

      if (imageResult.data?.length) {
        const rows = imageResult.data as ImageRow[];
        const { data: signed } = await supabase!.storage.from("part-images").createSignedUrls(rows.map((image) => image.storage_path), 3600);
        setImages(rows.map((image, index) => ({ ...image, signedUrl: signed?.[index]?.signedUrl })));
      }

      if (relationshipResult.data?.group_id) {
        const memberResult = await supabase!.from("part_order_group_members").select("part_id").eq("group_id", relationshipResult.data.group_id).neq("part_id", partId);
        const relatedIds = (memberResult.data ?? []).map((item) => item.part_id);
        const { data } = relatedIds.length ? await supabase!.from("parts").select("id, description, manufacturer_part_number").in("id", relatedIds) : { data: [] };
        if (data) setRelated(data as RelatedPart[]);
      }
      setLoading(false);
    }

    loadPart();
  }, [partId]);

  return <AppShell>{(profile, siteMode) => <main className="workspace detail-workspace">
    <div className="part-toolbar"><a className="back-link" href="/dashboard">← Back to parts search</a><div className="heading-actions">{part && <AddToBomButton partId={part.id} compact/>}{profile.role === "admin" && (siteMode === "standby" ? <span className="button secondary compact disabled">Edit part</span> : <a className="button secondary compact" href={`/admin/parts/${partId}/edit`}>Edit part</a>)}</div></div>
    {loading ? <section className="detail-state"><div className="spinner"/><p>Loading part information…</p></section> : error || !part ? <section className="detail-state"><BoxIcon/><h1>Part unavailable</h1><p>{error}</p><a className="button primary" href="/dashboard">Return to search</a></section> : <>
      <section className="detail-hero">
        <div className="detail-icon"><BoxIcon/></div>
        <div><p className="eyebrow accent">Approved part</p><h1>{part.description}</h1><div className="detail-identifiers"><span>Manufacturer part <strong className="mono">{part.manufacturer_part_number ?? "Not supplied"}</strong></span></div></div>
        <div className="detail-status"><em className={`supply ${part.supply_type}`}>{supplyTypes.find((item) => item.code === part.supply_type)?.name ?? part.supply_type}</em><span>{part.status}</span></div>
      </section>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="detail-card"><div className="detail-card-heading"><h2>Part information</h2></div><dl className="facts-grid"><div><dt>Part Description</dt><dd className="value-with-copy"><span>{part.description}</span><button type="button" title="Copy part description" aria-label="Copy part description" onClick={() => copyValue("description", part.description)}><CopyIcon/>{copiedField === "description" && <em>Copied</em>}</button></dd></div><div><dt>Manufacturer</dt><dd>{part.manufacturer?.name ?? "Not specified"}</dd></div><div><dt>Part Number Manufacturer</dt><dd className="value-with-copy mono"><span>{part.manufacturer_part_number ?? "—"}</span>{part.manufacturer_part_number && <button type="button" title="Copy manufacturer part number" aria-label="Copy manufacturer part number" onClick={() => copyValue("part-number", part.manufacturer_part_number!)}><CopyIcon/>{copiedField === "part-number" && <em>Copied</em>}</button>}</dd></div><div><dt>Supply type</dt><dd>{supplyTypes.find((item) => item.code === part.supply_type)?.name ?? part.supply_type}</dd></div></dl>{part.notes && <div className="notes-block"><h3>Notes</h3><p>{part.notes}</p></div>}</section>

          <section className="detail-card"><div className="detail-card-heading"><h2>Preferred suppliers</h2><span>{suppliers.length} listed</span></div>{suppliers.length ? <div className="supplier-list">{suppliers.map((row) => <article key={`${row.preference_rank}-${row.supplier?.name}`}><span className="supplier-rank">{row.preference_rank}</span><div><strong>{row.supplier?.name ?? "Supplier"}</strong><small>{row.supplier_part_number ? `Supplier part: ${row.supplier_part_number}` : "No supplier part number"}</small>{(row.ordering_information || row.supplier?.ordering_information) && <p>{row.ordering_information || row.supplier?.ordering_information}</p>}{row.notes && <p>{row.notes}</p>}</div>{row.supplier?.website_url && <a href={row.supplier.website_url} target="_blank" rel="noreferrer">Supplier site ↗</a>}</article>)}</div> : <p className="empty-detail">No preferred suppliers have been added.</p>}</section>

          <section className="detail-card"><div className="detail-card-heading"><h2>Machine compatibility</h2><span>{compatibility.length} machines</span></div>{compatibility.length ? <div className="compatibility-list">{compatibility.map((row, index) => <article key={index}><strong>{row.machine?.name ?? "Machine"}</strong><span>{[row.machine?.manufacturer?.name, row.machine?.model].filter(Boolean).join(" · ")}</span>{row.notes && <p>{row.notes}</p>}</article>)}</div> : <p className="empty-detail">No machine compatibility records have been linked.</p>}</section>
        </div>

        <aside className="detail-side">
          <section className="detail-card"><div className="detail-card-heading"><h2>Images</h2><span>{images.length}</span></div>{images.length ? <div className="image-grid">{images.map((image) => image.signedUrl ? <figure key={image.id}><button type="button" onClick={() => setSelectedImage(image)} aria-label={`Open ${image.caption ?? image.kind} image`}><Image unoptimized width={420} height={420} src={image.signedUrl} alt={image.caption ?? `${image.kind} view of ${part.description}`}/></button><figcaption>{image.caption ?? image.kind}</figcaption></figure> : null)}</div> : <div className="image-placeholder"><BoxIcon/><p>No part images uploaded</p></div>}</section>
          <section className="detail-card"><div className="detail-card-heading"><h2>Consider ordering with</h2></div>{related.length ? <div className="related-list">{related.map((item) => <a key={item.id} href={`/parts/${item.id}`}><span><strong>{item.description}</strong><small>{item.manufacturer_part_number ?? "No part number"}</small></span><ArrowIcon/></a>)}</div> : <p className="empty-detail">No related parts have been added.</p>}</section>
        </aside>
      </div>
    </>}{selectedImage?.signedUrl && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Part image preview" onClick={() => setSelectedImage(null)}><button className="lightbox-close" type="button" onClick={() => setSelectedImage(null)} aria-label="Close image">×</button><div onClick={(event) => event.stopPropagation()}><Image unoptimized width={1400} height={1400} src={selectedImage.signedUrl} alt={selectedImage.caption ?? `${selectedImage.kind} view of ${part?.description ?? "part"}`}/><p>{selectedImage.caption ?? selectedImage.kind}</p></div></div>}
  </main>}</AppShell>;
}
