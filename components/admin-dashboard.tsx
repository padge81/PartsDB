"use client";

import { useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { ArrowIcon, ClipboardIcon, ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type AdminRequest = { id: string; part_description: string; machine_model: string | null; status: string; submitted_at: string | null; requester?: { display_name: string | null } | null };

export function AdminDashboard() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getSupabaseBrowserClient()?.from("part_requests").select("id,part_description,machine_model,status,submitted_at,requester:profiles!part_requests_requested_by_fkey(display_name)").in("status", ["pending", "draft"]).order("submitted_at", { ascending: true }).then(({ data }) => { setRequests((data ?? []) as unknown as AdminRequest[]); setLoading(false); }); }, []);
  return <AppShell requireAdmin>{() => <main className="workspace">
    <section className="workspace-heading"><div><p className="eyebrow accent">Administrator portal</p><h1>Review and maintain</h1><p>Protect data quality while keeping technicians moving.</p></div><div className="heading-actions"><a className="button secondary" href="/dashboard">Browse / edit parts</a><a className="button secondary" href="/admin/machines">Manage machines</a><a className="button secondary" href="/admin/backup">Backup / Import</a><a className="button secondary" href="/admin/bulk-import">Bulk reference import</a><a className="button secondary" href="/admin/reference-data">Manage reference data</a><span className="admin-badge"><ShieldIcon/>Administrator</span></div></section>
    <section className="stat-grid">
      <article><span className="stat-icon amber"><ClipboardIcon/></span><div><strong>{requests.length}</strong><p>Pending requests</p></div><small>Awaiting review</small></article>
      <article><span className="stat-icon green">✓</span><div><strong>Live</strong><p>Approval workflow</p></div><small>Creates active parts</small></article>
      <article><span className="stat-icon blue">↺</span><div><strong>Audit</strong><p>Changes recorded</p></div><small>Administrator actions</small></article>
    </section>
    <section className="admin-panel">
      <div className="panel-heading"><div><h2>Pending add-part requests</h2><p>Review submitted information before it enters the repository.</p></div><button className="button secondary">View history</button></div>
      <div className="request-list">
        {loading ? <div className="empty-row">Loading requests…</div> : requests.map((request) => <a href={`/admin/requests/${request.id}`} className="request-row" key={request.id}><span className="request-id">{request.id.slice(0,8)}</span><span><strong>{request.part_description}</strong><small>{request.requester?.display_name ?? "PartsDB user"} · {request.machine_model ?? "No machine"}</small></span><span className="request-age">{request.submitted_at ? new Date(request.submitted_at).toLocaleDateString() : "Draft"}</span><em className={request.status}>{request.status}</em><ArrowIcon/></a>)}
        {!loading && !requests.length && <div className="empty-row">No requests are waiting for review.</div>}
      </div>
    </section>
  </main>}</AppShell>;
}
