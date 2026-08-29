"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, type ChangeSiteMode, type Profile, type SiteMode } from "./app-shell";
import { ArrowIcon, BoxIcon, ChevronIcon, ClipboardIcon, SearchIcon, ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { ApprovalSkipError, approvePartRequest, type ApprovalRequest } from "../lib/approve-part-request";

type AdminRequest = ApprovalRequest & { submitted_at: string | null; requester?: { display_name: string | null } | null };
type BulkResult = { approved: number; skipped: string[]; failed: string[] };
type RequestFilter = "pending" | "draft";
type RequestSort = "oldest" | "newest";

const managementTools = [
  { title: "Reference data", description: "Companies, machines, categories and supply types.", href: "/admin/reference-data", action: "Open reference data", maintenanceOnly: true },
  { title: "Company editor", description: "Search and maintain company roles and ordering details.", href: "/admin/companies", action: "Open company editor" },
  { title: "Machine editor", description: "Search machines and maintain details, status and images.", href: "/admin/machines", action: "Open machine editor" },
  { title: "Bulk reference import", description: "Import companies, roles and machines from Excel.", href: "/admin/bulk-import", action: "Open bulk import", maintenanceOnly: true },
] as const;

export function AdminDashboard() {
  const [requests, setRequests] = useState<AdminRequest[]>([]), [loading, setLoading] = useState(true);
  const [approvedParts, setApprovedParts] = useState(0), [activeMachines, setActiveMachines] = useState(0);
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("pending"), [requestSort, setRequestSort] = useState<RequestSort>("oldest"), [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]), [confirming, setConfirming] = useState(false), [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 }), [result, setResult] = useState<BulkResult | null>(null);

  const loadDashboard = useCallback(async () => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) { setLoading(false); return; }
    const [requestResult, partResult, machineResult] = await Promise.all([
      supabase.from("part_requests").select("*,requester:profiles!part_requests_requested_by_fkey(display_name)").in("status", ["pending", "draft"]).order("submitted_at", { ascending: true }),
      supabase.from("parts").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("machines").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    setRequests((requestResult.data ?? []) as unknown as AdminRequest[]); setApprovedParts(partResult.count ?? 0); setActiveMachines(machineResult.count ?? 0); setLoading(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(loadDashboard); }, [loadDashboard]);

  const pendingIds = useMemo(() => requests.filter((request) => request.status === "pending").map((request) => request.id), [requests]);
  const draftCount = useMemo(() => requests.filter((request) => request.status === "draft").length, [requests]);
  const visibleRequests = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return requests.filter((request) => request.status === requestFilter && (!term || [request.part_description, request.machine_model ?? "", request.requester?.display_name ?? "", request.id].some((value) => value.toLocaleLowerCase().includes(term)))).sort((left, right) => {
      const leftTime = left.submitted_at ? new Date(left.submitted_at).getTime() : 0, rightTime = right.submitted_at ? new Date(right.submitted_at).getTime() : 0;
      return requestSort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });
  }, [requestFilter, requestSort, requests, search]);
  const visiblePendingIds = useMemo(() => visibleRequests.filter((request) => request.status === "pending").map((request) => request.id), [visibleRequests]);
  const allVisibleSelected = visiblePendingIds.length > 0 && visiblePendingIds.every((id) => selectedIds.includes(id));

  function toggle(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); setConfirming(false); setResult(null); }
  function toggleAll() { setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !visiblePendingIds.includes(id)) : Array.from(new Set([...current, ...visiblePendingIds]))); setConfirming(false); setResult(null); }
  async function bulkApprove(profile: Profile) {
    const supabase = getSupabaseBrowserClient(); if (!supabase || !selectedIds.length) return;
    setConfirming(false); setProcessing(true); setResult(null); setProgress({ current: 0, total: selectedIds.length });
    const summary: BulkResult = { approved: 0, skipped: [], failed: [] };
    for (const [index, id] of selectedIds.entries()) {
      const request = requests.find((item) => item.id === id);
      if (!request) summary.skipped.push(`${id.slice(0, 8)}: request was not found.`);
      else try { await approvePartRequest(supabase, request, profile.id); summary.approved += 1; } catch (error) { const detail = `${request.part_description}: ${error instanceof Error ? error.message : "Unknown error"}`; if (error instanceof ApprovalSkipError) summary.skipped.push(detail); else summary.failed.push(detail); }
      setProgress({ current: index + 1, total: selectedIds.length });
    }
    setSelectedIds([]); setResult(summary); setProcessing(false); await loadDashboard();
  }

  return <AppShell requireAdmin>{(profile, siteMode, changeSiteMode) => <main className="workspace admin-workspace">
    <section className="workspace-heading admin-heading"><div><p className="eyebrow accent">Administrator portal</p><h1>Review and maintain</h1><p>Review incoming parts and manage the controlled PartsDB records.</p></div><div className="heading-actions"><a className="button secondary" href="/dashboard">Browse parts</a><span className="admin-badge"><ShieldIcon/>Administrator</span></div></section>
    <SiteModeControl siteMode={siteMode} changeSiteMode={changeSiteMode}/>
    <section className="admin-stat-grid" aria-label="Database summary">
      <a href="#request-queue"><span className="stat-icon amber"><ClipboardIcon/></span><div><strong>{pendingIds.length}</strong><p>Pending requests</p></div><small>Awaiting review</small></a>
      <button type="button" onClick={() => { setRequestFilter("draft"); document.querySelector("#request-queue")?.scrollIntoView({ behavior: "smooth" }); }}><span className="stat-icon blue">✎</span><div><strong>{draftCount}</strong><p>Draft requests</p></div><small>Not ready for approval</small></button>
      <a href="/dashboard"><span className="stat-icon green"><BoxIcon/></span><div><strong>{approvedParts}</strong><p>Approved parts</p></div><small>Available to search</small></a>
      <a href="/admin/machines"><span className="stat-icon blue">⚙</span><div><strong>{activeMachines}</strong><p>Active machines</p></div><small>Open Machine editor</small></a>
    </section>
    <section className="admin-panel" id="request-queue"><div className="panel-heading"><div><h2>Part request queue</h2><p>Review requests individually or select complete submissions for bulk approval.</p></div><span>{visibleRequests.length} shown</span></div>
      {siteMode === "standby" && <div className="backup-note"><strong>Standby protection active</strong><p>Requests can be inspected, but approval and editing require Maintenance mode.</p></div>}
      <div className="admin-request-tools"><div className="request-tabs" role="tablist" aria-label="Request status"><button type="button" role="tab" aria-selected={requestFilter === "pending"} className={requestFilter === "pending" ? "active" : ""} onClick={() => { setRequestFilter("pending"); setConfirming(false); }}>Pending <span>{pendingIds.length}</span></button><button type="button" role="tab" aria-selected={requestFilter === "draft"} className={requestFilter === "draft" ? "active" : ""} onClick={() => { setRequestFilter("draft"); setConfirming(false); }}>Drafts <span>{draftCount}</span></button></div><label className="admin-request-search"><SearchIcon/><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requests, machines or users"/></label><label className="admin-request-sort">Sort<select value={requestSort} onChange={(event) => setRequestSort(event.target.value as RequestSort)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label></div>
      {siteMode !== "standby" && requestFilter === "pending" && visiblePendingIds.length > 0 && <div className="bulk-approval-toolbar"><label><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={processing}/> Select all visible</label><span>{selectedIds.length} selected</span><button type="button" className="button primary" disabled={!selectedIds.length || processing} onClick={() => setConfirming(true)}>Bulk approve</button></div>}
      {confirming && <div className="bulk-confirmation" role="alert"><div><strong>Approve {selectedIds.length} selected request{selectedIds.length === 1 ? "" : "s"}?</strong><p>Possible duplicates will be skipped for individual review. Existing individual approval remains available.</p></div><button type="button" className="button secondary" onClick={() => setConfirming(false)}>Cancel</button><button type="button" className="button primary" onClick={() => void bulkApprove(profile)}>Confirm approval</button></div>}
      {processing && <div className="bulk-progress" aria-live="polite"><strong>Approving request {Math.min(progress.current + 1, progress.total)} of {progress.total}…</strong><progress value={progress.current} max={progress.total}/></div>}
      {result && <div className="bulk-summary" aria-live="polite"><strong>Bulk approval complete: {result.approved} approved, {result.skipped.length} skipped, {result.failed.length} failed.</strong>{result.skipped.map((item) => <p key={`skip-${item}`}>Skipped — {item}</p>)}{result.failed.map((item) => <p className="error-text" key={`fail-${item}`}>Failed — {item}</p>)}</div>}
      <div className="admin-request-scroll"><div className="request-list">{loading ? <div className="empty-row">Loading requests…</div> : visibleRequests.map((request) => <div className="bulk-request-item" key={request.id}><label className="request-checkbox">{request.status === "pending" ? <input type="checkbox" checked={selectedIds.includes(request.id)} disabled={processing || siteMode === "standby"} onChange={() => toggle(request.id)} aria-label={`Select ${request.part_description}`}/> : <span title="Drafts must be submitted before approval">—</span>}</label><a href={`/admin/requests/${request.id}`} className="request-row"><span className="request-id">{request.id.slice(0,8)}</span><span><strong>{request.part_description}</strong><small>{request.requester?.display_name ?? "PartsDB user"} · {request.machine_model ?? "No machine"}</small></span><span className="request-age">{request.submitted_at ? new Date(request.submitted_at).toLocaleDateString() : "Draft"}</span><em className={request.status}>{request.status}</em><ArrowIcon/></a></div>)}{!loading && !visibleRequests.length && <div className="empty-row">No matching {requestFilter} requests.</div>}</div></div>
    </section>
    <section className="admin-management"><div className="results-meta"><div><h2>Database management</h2><span>Controlled administration tools</span></div></div><div className="admin-tool-grid">{managementTools.map((tool) => {
      const blocked = siteMode === "standby" && tool.maintenanceOnly;
      return <article key={tool.title}><span className="admin-tool-icon"><ShieldIcon/></span><div><h3>{tool.title}</h3><p>{tool.description}</p></div>{blocked ? <span className="admin-tool-link disabled">Maintenance required</span> : <a className="admin-tool-link" href={tool.href}>{tool.action}<ArrowIcon/></a>}</article>;
    })}</div></section>
    <section className="admin-system-card"><div><span className="admin-tool-icon"><BoxIcon/></span><div><h2>Backup and restore</h2><p>Create, validate or restore the portable PartsDB archive.</p></div></div><a className="button secondary" href="/admin/backup">Open backup tools</a></section>
  </main>}</AppShell>;
}

function SiteModeControl({ siteMode, changeSiteMode }: { siteMode: SiteMode; changeSiteMode: ChangeSiteMode }) {
  return <section className={`site-mode-control compact ${siteMode}`}><div><span className="site-mode-dot"/><div><strong>Server mode: {siteMode}</strong><p>{siteMode === "live" ? "Production editing is enabled." : siteMode === "standby" ? "Protected read-only server." : "Temporary editing for restore or testing."}</p></div></div><details><summary>Change server mode <ChevronIcon/></summary><div>{siteMode !== "standby" && <button className="button secondary" type="button" onClick={() => { if (window.prompt("Type SET STANDBY to lock this server.") === "SET STANDBY") void changeSiteMode("standby"); }}>Set standby</button>}{siteMode === "standby" && <button className="button primary" type="button" onClick={() => { if (window.prompt("Type ENABLE EDITING to enter Maintenance mode.") === "ENABLE EDITING") void changeSiteMode("maintenance"); }}>Enable maintenance</button>}{siteMode !== "live" && <button className="button danger" type="button" onClick={() => { if (window.prompt("Type SET LIVE to permanently enable normal editing.") === "SET LIVE") void changeSiteMode("live"); }}>Set live</button>}</div></details></section>;
}
