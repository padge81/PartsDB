"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "./app-shell";
import { PlusIcon, ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type Manufacturer = { id: string; name: string; notes: string | null };
type Supplier = { id: string; name: string; website_url: string | null; ordering_information: string | null };
type Machine = { id: string; model: string; name: string | null; manufacturer_id: string; manufacturer?: { name: string } | null };

export function ReferenceDataManager() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineManufacturerFilter, setMachineManufacturerFilter] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const [manufacturer, supplier, machine] = await Promise.all([
      supabase.from("manufacturers").select("id,name,notes").eq("is_active", true).order("name"),
      supabase.from("suppliers").select("id,name,website_url,ordering_information").eq("is_active", true).order("name"),
      supabase.from("machines").select("id,model,name,manufacturer_id,manufacturer:manufacturers(name)").eq("is_active", true).order("model"),
    ]);
    setManufacturers((manufacturer.data ?? []) as Manufacturer[]); setSuppliers((supplier.data ?? []) as Supplier[]);
    setMachines((machine.data ?? []) as unknown as Machine[]);
  }, []);
  useEffect(() => {
    // Data is loaded after the asynchronous Supabase calls resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function add(event: FormEvent<HTMLFormElement>, table: "manufacturers" | "suppliers" | "machines") {
    event.preventDefault(); setMessage(""); const formElement = event.currentTarget; const form = new FormData(formElement); const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    let values: Record<string, string | null> = {};
    if (table === "manufacturers") values = { name: String(form.get("name") ?? ""), notes: String(form.get("notes") ?? "") || null };
    if (table === "suppliers") values = { name: String(form.get("name") ?? ""), website_url: String(form.get("website_url") ?? "") || null, ordering_information: String(form.get("ordering_information") ?? "") || null };
    if (table === "machines") values = { manufacturer_id: String(form.get("manufacturer_id") ?? ""), model: String(form.get("model") ?? ""), name: String(form.get("name") ?? "") || null };
    const { error } = await supabase.from(table).insert(values); if (error) setMessage(error.message); else {
      formElement.reset();
      await load();
      const refreshUrl = new URL(window.location.href);
      refreshUrl.searchParams.set("refresh", Date.now().toString());
      window.location.replace(refreshUrl.toString());
    }
  }

  return <AppShell requireAdmin>{() => <main className="workspace reference-workspace"><a className="back-link" href="/admin">← Back to administrator portal</a><section className="workspace-heading"><div><p className="eyebrow accent">Database administration</p><h1>Reference data</h1><p>Add controlled values used by the user and approval dropdown lists.</p></div><span className="admin-badge"><ShieldIcon/>Administrator</span></section>{message && <p className="form-message success-message">{message}</p>}<div className="reference-grid">
    <ReferenceCard title="Manufacturers" count={manufacturers.length} items={manufacturers.map((item) => ({ id: item.id, title: item.name, detail: item.notes }))}><form onSubmit={(event) => add(event, "manufacturers")}><input name="name" required placeholder="Manufacturer name"/><input name="notes" placeholder="Notes (optional)"/><button className="button primary"><PlusIcon/>Add manufacturer</button></form></ReferenceCard>
    <ReferenceCard title="Suppliers" count={suppliers.length} items={suppliers.map((item) => ({ id: item.id, title: item.name, detail: item.website_url }))}><form onSubmit={(event) => add(event, "suppliers")}><input name="name" required placeholder="Supplier name"/><input name="website_url" type="url" placeholder="Website URL"/><input name="ordering_information" placeholder="Ordering information"/><button className="button primary"><PlusIcon/>Add supplier</button></form></ReferenceCard>
    <ReferenceCard title="Machines" count={machines.filter((item) => !machineManufacturerFilter || item.manufacturer_id === machineManufacturerFilter).length} items={machines.filter((item) => !machineManufacturerFilter || item.manufacturer_id === machineManufacturerFilter).map((item) => ({ id: item.id, title: item.name || item.model, detail: item.manufacturer?.name }))}><form onSubmit={(event) => add(event, "machines")}><select name="manufacturer_id" required value={machineManufacturerFilter} onChange={(event) => setMachineManufacturerFilter(event.target.value)}><option value="">Machine manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input name="model" required placeholder="Machine model"/><input name="name" placeholder="Machine name"/><button className="button primary"><PlusIcon/>Add machine</button></form></ReferenceCard>
  </div></main>}</AppShell>;
}

function ReferenceCard({ title, count, items, children }: { title: string; count: number; items: Array<{ id: string; title: string; detail?: string | null }>; children: ReactNode }) {
  return <section className="reference-card"><div className="detail-card-heading"><h2>{title}</h2><span>{count}</span></div><div className="reference-form">{children}</div><div className="reference-list">{items.map((item) => <div key={item.id}><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</div>)}{!items.length && <p>No records added.</p>}</div></section>;
}
