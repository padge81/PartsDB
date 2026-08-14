"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { ArrowIcon, ClipboardIcon, PlusIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type RequestRow = { id: string; part_description: string; machine_model: string | null; status: string; submitted_at: string | null; created_at: string };

export function MyRequests() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getSupabaseBrowserClient()?.from("part_requests").select("id,part_description,machine_model,status,submitted_at,created_at").order("created_at", { ascending: false }).then(({ data }) => { setRequests((data ?? []) as RequestRow[]); setLoading(false); }); }, []);
  return <AppShell>{() => <main className="workspace"><section className="workspace-heading"><div><p className="eyebrow accent">Request tracking</p><h1>My requests</h1><p>Track parts you have submitted for administrator review.</p></div><Link className="button primary" href="/parts/new"><PlusIcon/>Add part</Link></section><section className="admin-panel"><div className="panel-heading"><div><h2>Submitted requests</h2><p>Approved requests become searchable parts.</p></div></div><div className="request-list">{loading ? <div className="empty-row">Loading requests…</div> : requests.map((request) => <a href={`/requests/${request.id}`} className="request-row" key={request.id}><span className="request-id">{request.id.slice(0,8)}</span><span><strong>{request.part_description}</strong><small>{request.machine_model ?? "No machine specified"}</small></span><span className="request-age">{new Date(request.submitted_at ?? request.created_at).toLocaleDateString()}</span><em className={request.status}>{request.status}</em><ArrowIcon/></a>)}{!loading && !requests.length && <div className="empty-row"><ClipboardIcon/><p>You have not submitted any part requests.</p></div>}</div></section></main>}</AppShell>;
}
