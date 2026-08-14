"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { ClipboardIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type RequestRecord = { id: string; part_description: string; part_manufacturer: string | null; manufacturer_part_number: string | null; machine_manufacturer: string | null; machine_model: string | null; machine_revision: string | null; supply_type: string; compatibility_tags: string[]; notes: string | null; status: string; submitted_at: string | null; review_notes: string | null; approved_part_id: string | null };

export function RequestSummary({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getSupabaseBrowserClient()?.from("part_requests").select("*").eq("id", requestId).single().then(({ data }) => { setRequest(data as RequestRecord | null); setLoading(false); }); }, [requestId]);
  return <AppShell>{() => <main className="workspace detail-workspace"><Link className="back-link" href="/requests">← Back to my requests</Link>{loading ? <section className="detail-state"><div className="spinner"/></section> : !request ? <section className="detail-state"><ClipboardIcon/><h1>Request unavailable</h1></section> : <><section className="detail-hero"><div className="detail-icon"><ClipboardIcon/></div><div><p className="eyebrow accent">Part request</p><h1>{request.part_description}</h1><div className="detail-identifiers"><span>Reference <strong>{request.id.slice(0,8).toUpperCase()}</strong></span><span>Submitted <strong>{request.submitted_at ? new Date(request.submitted_at).toLocaleDateString() : "Draft"}</strong></span></div></div><div className="detail-status"><span>{request.status}</span></div></section><section className="detail-card request-summary-card"><div className="detail-card-heading"><h2>Submitted information</h2></div><dl className="facts-grid"><div><dt>Part manufacturer</dt><dd>{request.part_manufacturer ?? "—"}</dd></div><div><dt>Part Number Manufacturer</dt><dd className="mono">{request.manufacturer_part_number ?? "—"}</dd></div><div><dt>Machine Manufacturer</dt><dd>{request.machine_manufacturer ?? "—"}</dd></div><div><dt>Machine Name</dt><dd>{request.machine_model ?? "—"}</dd></div><div><dt>Machine Rev</dt><dd>{request.machine_revision ?? "—"}</dd></div><div><dt>Supply type</dt><dd>{request.supply_type.toUpperCase()}</dd></div><div><dt>Compatibility tags</dt><dd>{request.compatibility_tags?.join(", ") || "—"}</dd></div></dl>{request.notes && <div className="notes-block"><h3>Notes</h3><p>{request.notes}</p></div>}{request.review_notes && <div className="review-note"><strong>Administrator note</strong><p>{request.review_notes}</p></div>}{request.approved_part_id && <div className="form-actions"><a className="button primary" href={`/parts/${request.approved_part_id}`}>View approved part</a></div>}</section></>}</main>}</AppShell>;
}
