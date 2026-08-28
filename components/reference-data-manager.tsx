"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "./app-shell";
import { ChevronIcon, PlusIcon, ShieldIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type CompanyRole = "manufacturer" | "supplier" | "distributor";
type Company = { id: string; name: string; notes: string | null; website_url: string | null; ordering_information: string | null; supply_type: string; default_supplier_id: string | null; roles: CompanyRole[] };
type Machine = { id: string; model: string | null; name: string; manufacturer_id: string; manufacturer?: { name: string } | null };
type Category = { id: string; name: string; description: string | null };
type MachineCategory = { id: string; name: string; description: string | null };
type SupplyType = { id: string; code: string; name: string; description: string | null; is_active: boolean };

export function ReferenceDataManager() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [machineCategories, setMachineCategories] = useState<MachineCategory[]>([]);
  const [supplyTypes, setSupplyTypes] = useState<SupplyType[]>([]);
  const [supplyTypeUsage, setSupplyTypeUsage] = useState<Record<string, number>>({});
  const [replacementByCode, setReplacementByCode] = useState<Record<string, string>>({});
  const [machineManufacturerFilter, setMachineManufacturerFilter] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const [company, companyRole, machine, category, machineCategory, supplyType, partSupply, requestSupply, companySupply] = await Promise.all([
      supabase.from("companies").select("id,name,notes,website_url,ordering_information,supply_type,default_supplier_id").eq("is_active", true).order("name"),
      supabase.from("company_roles").select("company_id,role"),
      supabase.from("machines").select("id,model,name,manufacturer_id,manufacturer:companies(name)").eq("is_active", true).order("name"),
      supabase.from("categories").select("id,name,description").eq("is_active", true).order("name"),
      supabase.from("machine_categories").select("id,name,description").eq("is_active", true).order("name"),
      supabase.from("supply_types").select("id,code,name,description,is_active").order("name"),
      supabase.from("parts").select("supply_type"),
      supabase.from("part_requests").select("supply_type"),
      supabase.from("companies").select("supply_type"),
    ]);
    const roles = new Map<string, CompanyRole[]>();
    for (const row of companyRole.data ?? []) roles.set(row.company_id, [...(roles.get(row.company_id) ?? []), row.role as CompanyRole]);
    setCompanies((company.data ?? []).map((item) => ({ ...item, roles: roles.get(item.id) ?? [] })) as Company[]);
    setMachines((machine.data ?? []) as unknown as Machine[]);
    setCategories((category.data ?? []) as Category[]);
    setMachineCategories((machineCategory.data ?? []) as MachineCategory[]);
    setSupplyTypes((supplyType.data ?? []) as SupplyType[]);
    const usage: Record<string, number> = {};
    for (const row of [...(partSupply.data ?? []), ...(requestSupply.data ?? []), ...(companySupply.data ?? [])]) usage[row.supply_type] = (usage[row.supply_type] ?? 0) + 1;
    setSupplyTypeUsage(usage);
  }, []);
  useEffect(() => {
    // Data is loaded after the asynchronous Supabase calls resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const manufacturers = companies.filter((company) => company.roles.includes("manufacturer"));
  const suppliers = companies.filter((company) => company.roles.some((role) => role === "supplier" || role === "distributor"));
  const companySearchText = companySearch.trim().toLocaleLowerCase();
  const filteredCompanies = companies.filter((company) => !companySearchText || [company.name, company.website_url ?? "", ...company.roles].some((value) => value.toLocaleLowerCase().includes(companySearchText)));

  async function add(event: FormEvent<HTMLFormElement>, table: "companies" | "machines" | "categories" | "machine_categories" | "supply_types") {
    event.preventDefault(); setMessage(""); const formElement = event.currentTarget; const form = new FormData(formElement); const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    let values: Record<string, string | null> = {};
    if (table === "companies") values = { name: String(form.get("name") ?? "").trim(), notes: String(form.get("notes") ?? "") || null, website_url: String(form.get("website_url") ?? "") || null, ordering_information: String(form.get("ordering_information") ?? "") || null, supply_type: String(form.get("supply_type") ?? "unknown"), default_supplier_id: String(form.get("default_supplier_id") ?? "") || null };
    if (table === "machines") values = { manufacturer_id: String(form.get("manufacturer_id") ?? ""), name: String(form.get("name") ?? "").trim(), model: String(form.get("model") ?? "").trim() || null };
    if (table === "categories" || table === "machine_categories") values = { name: String(form.get("name") ?? ""), description: String(form.get("description") ?? "") || null };
    if (table === "supply_types") { const name = String(form.get("name") ?? "").trim(); values = { code: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name, description: String(form.get("description") ?? "") || null }; }
    const result = table === "companies" ? await supabase.from(table).insert(values).select("id").single() : await supabase.from(table).insert(values).select("*").single();
    if (!result.error && table === "companies") {
      const roles = (["manufacturer", "supplier", "distributor"] as CompanyRole[]).filter((role) => form.get(role) === "on");
      if (!roles.length) { await supabase.from("companies").delete().eq("id", result.data.id); setMessage("Select at least one company role."); return; }
      const roleResult = await supabase.from("company_roles").insert(roles.map((role) => ({ company_id: result.data.id, role })));
      if (roleResult.error) { setMessage(roleResult.error.message); return; }
      if (roles.includes("manufacturer") && roles.includes("supplier") && !values.default_supplier_id) await supabase.from("companies").update({ default_supplier_id: result.data.id }).eq("id", result.data.id);
    }
    if (result.error) setMessage(result.error.message); else {
      formElement.reset();
      await load();
      const refreshUrl = new URL(window.location.href);
      refreshUrl.searchParams.set("refresh", Date.now().toString());
      window.location.replace(refreshUrl.toString());
    }
  }

  async function editSupplyType(item: SupplyType) {
    const name = window.prompt("Supply type name", item.name); if (!name?.trim()) return;
    const description = window.prompt("Description (optional)", item.description ?? ""); if (description === null) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setMessage("");
    const { error } = await supabase.from("supply_types").update({ name: name.trim(), description: description.trim() || null }).eq("id", item.id);
    if (error) setMessage(error.message); else { await load(); setMessage("Supply type updated."); }
  }

  async function deactivateSupplyType(item: SupplyType) {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setMessage("");
    const replacement = replacementByCode[item.code] || null;
    const { data, error } = await supabase.rpc("replace_and_deactivate_supply_type", { old_code: item.code, replacement_code: replacement });
    if (error) setMessage(error.message); else {
      const result = data as { parts_replaced?: number; requests_replaced?: number; companies_replaced?: number } | null;
      await load();
      setMessage(`Supply type deactivated. ${(result?.parts_replaced ?? 0) + (result?.requests_replaced ?? 0) + (result?.companies_replaced ?? 0)} records updated.`);
    }
  }

  async function activateSupplyType(item: SupplyType) {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setMessage("");
    const { error } = await supabase.from("supply_types").update({ is_active: true }).eq("id", item.id);
    if (error) setMessage(error.message); else { await load(); setMessage("Supply type activated."); }
  }

  async function renameReference(table: "companies" | "categories" | "machine_categories", id: string, currentName: string) {

    const name = window.prompt(`Rename ${currentName}`, currentName); if (!name?.trim() || name.trim() === currentName) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setMessage("");
    const { error } = await supabase.from(table).update({ name: name.trim() }).eq("id", id);
    if (error) setMessage(error.message); else { await load(); setMessage("Name updated."); }
  }

  return <AppShell requireAdmin>{() => <main className="workspace reference-workspace"><a className="back-link" href="/admin">← Back to administrator portal</a><section className="workspace-heading"><div><p className="eyebrow accent">Database administration</p><h1>Reference data</h1><p>Add controlled values used by the user and approval dropdown lists.</p></div><span className="admin-badge"><ShieldIcon/>Administrator</span></section>{message && <p className="form-message success-message">{message}</p>}<div className="reference-grid">
    <ReferenceCard title="Companies" count={filteredCompanies.length} headingAction={<a className="button secondary compact" href="/admin/companies">Company editor</a>} items={filteredCompanies.map((item) => ({ id: item.id, title: item.name, detail: `${item.roles.map((role) => role[0].toUpperCase() + role.slice(1)).join(" · ")}${item.website_url ? ` · ${item.website_url}` : ""}` }))}><div className="reference-search"><label htmlFor="company-search">Search companies</label><input id="company-search" type="search" value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} placeholder="Search by company, role or website"/></div><form onSubmit={(event) => add(event, "companies")}><input name="name" required placeholder="Company name"/><div className="reference-controls"><label><input type="checkbox" name="manufacturer"/> Manufacturer</label><label><input type="checkbox" name="supplier"/> Supplier</label><label><input type="checkbox" name="distributor"/> Distributor</label></div><select name="supply_type" defaultValue="unknown">{supplyTypes.filter((type) => type.is_active).map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}</select><select name="default_supplier_id"><option value="">No default supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><input name="website_url" type="url" placeholder="Website URL"/><input name="ordering_information" placeholder="Ordering information"/><input name="notes" placeholder="Notes (optional)"/><button className="button primary"><PlusIcon/>Add company</button></form></ReferenceCard>
    <ReferenceCard title="Part categories" count={categories.length} items={categories.map((item) => ({ id: item.id, title: item.name, detail: item.description, control: <button type="button" className="reference-edit" onClick={() => renameReference("categories", item.id, item.name)}>Edit name</button> }))}><form onSubmit={(event) => add(event, "categories")}><input name="name" required placeholder="Category name"/><input name="description" placeholder="Description (optional)"/><button className="button primary"><PlusIcon/>Add category</button></form></ReferenceCard>
    <ReferenceCard title="Machine categories" count={machineCategories.length} items={machineCategories.map((item) => ({ id: item.id, title: item.name, detail: item.description, control: <button type="button" className="reference-edit" onClick={() => renameReference("machine_categories", item.id, item.name)}>Edit name</button> }))}><form onSubmit={(event) => add(event, "machine_categories")}><input name="name" required placeholder="Machine category name"/><input name="description" placeholder="Description (optional)"/><button className="button primary"><PlusIcon/>Add machine category</button></form></ReferenceCard>
    <ReferenceCard title="Supply types" count={supplyTypes.length} items={supplyTypes.map((item) => ({ id: item.id, title: item.name, detail: `${item.description || item.code} · ${supplyTypeUsage[item.code] ?? 0} records · ${item.is_active ? "Active" : "Inactive"}`, control: item.is_active ? <div className="reference-controls"><select aria-label={`Replacement for ${item.name}`} value={replacementByCode[item.code] ?? ""} onChange={(event) => setReplacementByCode((current) => ({ ...current, [item.code]: event.target.value }))} disabled={!supplyTypeUsage[item.code]}><option value="">{supplyTypeUsage[item.code] ? "Select replacement" : "No replacement needed"}</option>{supplyTypes.filter((type) => type.is_active && type.code !== item.code).map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}</select><button type="button" className="reference-edit" onClick={() => editSupplyType(item)}>Edit</button><button type="button" className="reference-edit" onClick={() => deactivateSupplyType(item)}>Deactivate</button></div> : <button type="button" className="reference-edit" onClick={() => activateSupplyType(item)}>Activate</button> }))}><form onSubmit={(event) => add(event, "supply_types")}><input name="name" required placeholder="Supply type name"/><input name="description" placeholder="Description (optional)"/><button className="button primary"><PlusIcon/>Add supply type</button></form></ReferenceCard>
    <ReferenceCard title="Machines" count={machines.filter((item) => !machineManufacturerFilter || item.manufacturer_id === machineManufacturerFilter).length} items={machines.filter((item) => !machineManufacturerFilter || item.manufacturer_id === machineManufacturerFilter).map((item) => ({ id: item.id, title: item.name, detail: [item.manufacturer?.name, item.model].filter(Boolean).join(" · "), control: <a className="reference-edit" href="/admin/machines">Full editor</a> }))}><form onSubmit={(event) => add(event, "machines")}><select name="manufacturer_id" required value={machineManufacturerFilter} onChange={(event) => setMachineManufacturerFilter(event.target.value)}><option value="">Machine manufacturer</option>{manufacturers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input name="name" required placeholder="Machine name"/><input name="model" placeholder="Machine model (optional)"/><button className="button primary"><PlusIcon/>Add machine</button></form></ReferenceCard>
  </div></main>}</AppShell>;
}

function ReferenceCard({ title, count, items, children, headingAction }: { title: string; count: number; items: Array<{ id: string; title: string; detail?: string | null; control?: ReactNode }>; children: ReactNode; headingAction?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <section className={`reference-card${expanded ? " expanded" : " collapsed"}`}><div className="detail-card-heading reference-card-heading"><h2>{title}</h2><div className="reference-heading-actions"><span>{count}</span>{headingAction}<button type="button" className="reference-toggle" aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}><ChevronIcon/></button></div></div>{expanded && <div className="reference-card-content"><div className="reference-form">{children}</div><div className="reference-list">{items.map((item) => <div key={item.id}><span><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</span>{item.control}</div>)}{!items.length && <p>No matching records.</p>}</div></div>}</section>;
}
