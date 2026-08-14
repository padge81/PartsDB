"use client";

import { AppShell } from "./app-shell";
import { ArrowIcon, ClipboardIcon, ShieldIcon } from "./icons";

const requests = [
  { id: "PR-1048", part: "M12 inductive proximity sensor", requester: "Jamie Chen", machine: "Cartoner C-200", age: "2h", status: "Pending" },
  { id: "PR-1047", part: "Stainless guide rail clamp", requester: "Alex Murray", machine: "Conveyor CV-14", age: "5h", status: "Pending" },
  { id: "PR-1046", part: "Servo motor power cable, 5 m", requester: "Morgan Lee", machine: "Palletiser P-3", age: "Yesterday", status: "Review" },
];

export function AdminDashboard() {
  return <AppShell requireAdmin>{() => <main className="workspace">
    <section className="workspace-heading"><div><p className="eyebrow accent">Administrator portal</p><h1>Review and maintain</h1><p>Protect data quality while keeping technicians moving.</p></div><span className="admin-badge"><ShieldIcon/>Administrator</span></section>
    <section className="stat-grid">
      <article><span className="stat-icon amber"><ClipboardIcon/></span><div><strong>3</strong><p>Pending requests</p></div><small>Oldest: yesterday</small></article>
      <article><span className="stat-icon green">✓</span><div><strong>18</strong><p>Approved this month</p></div><small>94% approval rate</small></article>
      <article><span className="stat-icon blue">↺</span><div><strong>7</strong><p>Recent changes</p></div><small>Last 7 days</small></article>
    </section>
    <section className="admin-panel">
      <div className="panel-heading"><div><h2>Pending add-part requests</h2><p>Review submitted information before it enters the repository.</p></div><button className="button secondary">View history</button></div>
      <div className="request-list">
        {requests.map((request) => <a href={`#${request.id}`} className="request-row" key={request.id}><span className="request-id">{request.id}</span><span><strong>{request.part}</strong><small>{request.requester} · {request.machine}</small></span><span className="request-age">{request.age}</span><em className={request.status === "Review" ? "review" : "pending"}>{request.status}</em><ArrowIcon/></a>)}
      </div>
    </section>
  </main>}</AppShell>;
}
