"use client";

import {readAllRows} from "../lib/machine-compatibility";
import { requestMachineLabel } from "../lib/request-machine-label";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { ArrowIcon, ClipboardIcon, PlusIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type RequestRow = { id: string; part_description: string; machine_name: string | null; machine_model: string | null; machine_ids: string[] | null; status: string; submitted_at: string | null; created_at: string };

export function MyRequests() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,setError] = useState("");
  useEffect(() => {
    const db=getSupabaseBrowserClient();
    if(!db) { const timer=setTimeout(()=>setLoading(false),0); return()=>clearTimeout(timer); }
    let alive=true;
    readAllRows((from,to)=>db.from("part_requests").select("id,part_description,machine_name,machine_model,machine_ids,status,submitted_at,created_at").order("created_at",{ascending:false}).order("id").range(from,to))
      .then(({data,error})=>{if(alive){setRequests(data as RequestRow[]);setError(error?"Requests could not be loaded. Please reload.":"");setLoading(false);}})
      .catch(()=>{if(alive){setError("Requests could not be loaded. Please reload.");setLoading(false);}});
    return()=>{alive=false;};
  }, []);
  return <AppShell>{(_, siteMode) => <main className="workspace"><section className="workspace-heading"><div><p className="eyebrow accent">Request tracking</p><h1>My requests</h1><p>Track parts you have submitted for administrator review.</p></div>{siteMode === "standby" ? <span className="button primary disabled" title="Editing is disabled in standby mode"><PlusIcon/>Add part</span> : <Link className="button primary" href="/parts/new"><PlusIcon/>Add part</Link>}</section><section className="admin-panel"><div className="panel-heading"><div><h2>Submitted requests</h2><p>Approved requests become searchable parts.</p></div></div><div className="request-list">{loading ? <div className="empty-row">Loading requests…</div> : error ? <div className="empty-row" role="alert">{error}</div> : requests.map((request) => <a href={`/requests/${request.id}`} className="request-row" key={request.id}><span className="request-id">{request.id.slice(0,8)}</span><span><strong>{request.part_description}</strong><small>{requestMachineLabel(request)}</small></span><span className="request-age">{new Date(request.submitted_at ?? request.created_at).toLocaleDateString()}</span><em className={request.status}>{request.status}</em><ArrowIcon/></a>)}{!loading && !error && !requests.length && <div className="empty-row"><ClipboardIcon/><p>You have not submitted any part requests.</p></div>}</div></section></main>}</AppShell>;
}
