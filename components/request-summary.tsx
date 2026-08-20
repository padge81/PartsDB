"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "./app-shell";
import { ClipboardIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { useSupplyTypes } from "../lib/use-supply-types";

type RequestRecord = { id: string; part_description: string; part_manufacturer: string | null; manufacturer_part_number: string | null; machine_manufacturer: string | null; machine_model: string | null; supply_type: string; notes: string | null; status: string; submitted_at: string | null; review_notes: string | null; approved_part_id: string | null };
type RequestImage = { id: string; storage_path: string; signedUrl?: string };

export function RequestSummary({ requestId }: { requestId: string }) {
  const supplyTypes = useSupplyTypes();
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<RequestImage[]>([]);
  useEffect(() => { const supabase = getSupabaseBrowserClient(); if (!supabase) return; Promise.all([supabase.from("part_requests").select("*").eq("id", requestId).single(), supabase.from("request_images").select("id,storage_path").eq("request_id", requestId).order("sort_order")]).then(async ([requestResult, imageResult]) => { setRequest(requestResult.data as RequestRecord | null); if (imageResult.data?.length) { const rows = imageResult.data as RequestImage[]; const { data: signed } = await supabase.storage.from("request-images").createSignedUrls(rows.map((image) => image.storage_path), 3600); setImages(rows.map((image, index) => ({ ...image, signedUrl: signed?.[index]?.signedUrl }))); } setLoading(false); }); }, [requestId]);
  return <AppShell>{() => <main className="workspace detail-workspace"><Link className="back-link" href="/requests">← Back to my requests</Link>{loading ? <section className="detail-state"><div className="spinner"/></section> : !request ? <section className="detail-state"><ClipboardIcon/><h1>Request unavailable</h1></section> : <><section className="detail-hero"><div className="detail-icon"><ClipboardIcon/></div><div><p className="eyebrow accent">Part request</p><h1>{request.part_description}</h1><div className="detail-identifiers"><span>Reference <strong>{request.id.slice(0,8).toUpperCase()}</strong></span><span>Submitted <strong>{request.submitted_at ? new Date(request.submitted_at).toLocaleDateString() : "Draft"}</strong></span></div></div><div className="detail-status"><span>{request.status}</span></div></section><section className="detail-card request-summary-card"><div className="detail-card-heading"><h2>Submitted information</h2></div><dl className="facts-grid"><div><dt>Part manufacturer</dt><dd>{request.part_manufacturer ?? "—"}</dd></div><div><dt>Part Number Manufacturer</dt><dd className="mono">{request.manufacturer_part_number ?? "—"}</dd></div><div><dt>Machine Manufacturer</dt><dd>{request.machine_manufacturer ?? "—"}</dd></div><div><dt>Machine Name</dt><dd>{request.machine_model ?? "—"}</dd></div><div><dt>Supply type</dt><dd>{supplyTypes.find((item) => item.code === request.supply_type)?.name ?? request.supply_type}</dd></div></dl>{request.notes && <div className="notes-block"><h3>Notes</h3><p>{request.notes}</p></div>}{request.review_notes && <div className="review-note"><strong>Administrator note</strong><p>{request.review_notes}</p></div>}{request.approved_part_id && <div className="form-actions"><a className="button primary" href={`/parts/${request.approved_part_id}`}>View approved part</a></div>}</section>{images.length > 0 && <section className="detail-card request-summary-card"><div className="detail-card-heading"><h2>Submitted images</h2><span>{images.length}</span></div><div className="review-image-grid">{images.map((image, index) => image.signedUrl ? <a key={image.id} href={image.signedUrl} target="_blank" rel="noreferrer"><Image unoptimized width={360} height={270} src={image.signedUrl} alt={`Submitted part image ${index + 1}`}/><span>Image {index + 1} · open full size</span></a> : null)}</div></section>}</>}</main>}</AppShell>;
}
