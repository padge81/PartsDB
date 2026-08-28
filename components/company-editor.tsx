"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "./app-shell";
import { ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type CompanyRole = "manufacturer" | "supplier" | "distributor";
type Company = {
  id: string;
  name: string;
  notes: string | null;
  website_url: string | null;
  ordering_information: string | null;
  supply_type: string;
  default_supplier_id: string | null;
  is_active: boolean;
  roles: CompanyRole[];
};
type SupplyType = { code: string; name: string; is_active: boolean };

const companyRoles: Array<{ value: CompanyRole; label: string }> = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "supplier", label: "Supplier" },
  { value: "distributor", label: "Distributor" },
];

export function CompanyEditor() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [supplyTypes, setSupplyTypes] = useState<SupplyType[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Company | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (keepSelectedId = "") => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const [companyResult, roleResult, supplyTypeResult] = await Promise.all([
      supabase.from("companies").select("id,name,notes,website_url,ordering_information,supply_type,default_supplier_id,is_active").order("name"),
      supabase.from("company_roles").select("company_id,role"),
      supabase.from("supply_types").select("code,name,is_active").order("name"),
    ]);
    if (companyResult.error || roleResult.error || supplyTypeResult.error) {
      setMessage(companyResult.error?.message ?? roleResult.error?.message ?? supplyTypeResult.error?.message ?? "Companies could not be loaded.");
      return;
    }
    const roles = new Map<string, CompanyRole[]>();
    for (const row of roleResult.data ?? []) roles.set(row.company_id, [...(roles.get(row.company_id) ?? []), row.role as CompanyRole]);
    const loaded = (companyResult.data ?? []).map((company) => ({ ...company, roles: roles.get(company.id) ?? [] })) as Company[];
    setCompanies(loaded); setSupplyTypes((supplyTypeResult.data ?? []) as SupplyType[]);
    const selected = loaded.find((company) => company.id === keepSelectedId);
    if (selected) { setSelectedId(selected.id); setDraft({ ...selected, roles: [...selected.roles] }); }
  }, []);

  useEffect(() => {
    // Data is loaded after the asynchronous Supabase calls resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return companies.filter((company) => !term || [company.name, company.website_url ?? "", ...company.roles].some((value) => value.toLocaleLowerCase().includes(term)));
  }, [companies, search]);
  const suppliers = companies.filter((company) => company.roles.some((role) => role === "supplier" || role === "distributor"));

  function selectCompany(id: string) {
    const company = companies.find((item) => item.id === id) ?? null;
    setSelectedId(id); setDraft(company ? { ...company, roles: [...company.roles] } : null); setMessage("");
  }

  function toggleRole(role: CompanyRole, checked: boolean) {
    if (!draft) return;
    setDraft({ ...draft, roles: checked ? [...new Set([...draft.roles, role])] : draft.roles.filter((item) => item !== role) });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft || !draft.roles.length) { setMessage("Select at least one company role."); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setSaving(true); setMessage("");
    const current = companies.find((company) => company.id === draft.id);
    const updated = await supabase.from("companies").update({
      name: draft.name.trim(), notes: draft.notes?.trim() || null, website_url: draft.website_url?.trim() || null,
      ordering_information: draft.ordering_information?.trim() || null, supply_type: draft.supply_type,
      default_supplier_id: draft.roles.includes("manufacturer") ? draft.default_supplier_id || null : null, is_active: draft.is_active,
    }).eq("id", draft.id);
    if (updated.error) { setMessage(updated.error.message); setSaving(false); return; }
    const addedRoles = draft.roles.filter((role) => !current?.roles.includes(role));
    const removedRoles = (current?.roles ?? []).filter((role) => !draft.roles.includes(role));
    if (addedRoles.length) {
      const added = await supabase.from("company_roles").insert(addedRoles.map((role) => ({ company_id: draft.id, role })));
      if (added.error) { setMessage(added.error.message); setSaving(false); return; }
    }
    if (removedRoles.length) {
      const removed = await supabase.from("company_roles").delete().eq("company_id", draft.id).in("role", removedRoles);
      if (removed.error) { setMessage(removed.error.message); setSaving(false); return; }
    }
    await load(draft.id); setSaving(false); setMessage("Company updated.");
  }

  return <AppShell requireAdmin>{(_profile, siteMode) => <main className="workspace form-workspace"><a className="back-link" href="/admin/reference-data">← Back to reference data</a><section className="workspace-heading"><div><p className="eyebrow accent">Database administration</p><h1>Company editor</h1><p>Search for a company, then edit its identity, roles and ordering details.</p></div><span className="admin-badge"><ShieldIcon/>Administrator</span></section>{message && <p className="form-message success-message">{message}</p>}
    <section className="form-card company-picker"><div className="detail-card-heading"><h2>Select company</h2><span>{filteredCompanies.length} matches</span></div><div className="form-grid"><label className="span-2">Search companies<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by company, role or website"/></label><label className="span-2">Company<select size={Math.min(Math.max(filteredCompanies.length, 3), 9)} value={selectedId} onChange={(event) => selectCompany(event.target.value)}>{filteredCompanies.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.roles.join(" / ") || "No role"}{company.is_active ? "" : " · Inactive"}</option>)}</select></label></div></section>
    {draft ? <form className="record-form company-edit-form" onSubmit={save}><section className="form-card"><div className="detail-card-heading"><h2>Company information</h2><span>{draft.is_active ? "Active" : "Inactive"}</span></div><div className="form-grid"><label className="span-2">Company name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><fieldset className="category-checkbox-field"><legend>Company roles</legend><div className="category-checkbox-grid">{companyRoles.map((role) => <label key={role.value}><input type="checkbox" checked={draft.roles.includes(role.value)} onChange={(event) => toggleRole(role.value, event.target.checked)}/><span>{role.label}</span></label>)}</div></fieldset><label>Supply type<select value={draft.supply_type} disabled={!draft.roles.some((role) => role === "supplier" || role === "distributor")} onChange={(event) => setDraft({ ...draft, supply_type: event.target.value })}>{supplyTypes.map((type) => <option key={type.code} value={type.code}>{type.name}{type.is_active ? "" : " (inactive)"}</option>)}</select></label><label>Default supplier<select value={draft.default_supplier_id ?? ""} disabled={!draft.roles.includes("manufacturer")} onChange={(event) => setDraft({ ...draft, default_supplier_id: event.target.value || null })}><option value="">No default supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="span-2">Website URL<input type="url" value={draft.website_url ?? ""} onChange={(event) => setDraft({ ...draft, website_url: event.target.value })} placeholder="https://example.com"/></label><label className="span-2">Ordering information<textarea rows={4} value={draft.ordering_information ?? ""} onChange={(event) => setDraft({ ...draft, ordering_information: event.target.value })}/></label><label className="span-2">Notes<textarea rows={5} value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })}/></label><label>Status<select value={draft.is_active ? "active" : "inactive"} onChange={(event) => setDraft({ ...draft, is_active: event.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div></section><div className="form-actions"><button type="button" className="button secondary" onClick={() => selectCompany(draft.id)}>Discard changes</button><button className="button primary" disabled={saving || siteMode === "standby"}>{siteMode === "standby" ? "Standby read-only" : saving ? "Saving…" : "Save company"}</button></div></form> : <section className="detail-state company-empty"><p>Select a company above to open the full editor.</p></section>}
  </main>}</AppShell>;
}
