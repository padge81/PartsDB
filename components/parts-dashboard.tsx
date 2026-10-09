"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { ArrowIcon, BoxIcon, PlusIcon, SearchIcon } from "./icons";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase";
import { useSupplyTypes } from "../lib/use-supply-types";
import type { ApprovedRepair } from "../lib/workshop";
import { AddToBomButton } from "./add-to-bom-button";

type Part = { id: string; description: string; manufacturer_part_number: string | null; supply_type: string; manufacturer?: { name: string } | null };
type Manufacturer = { id: string; name: string };
type Machine = { id: string; model: string | null; name: string; notes: string | null; manufacturer_id: string; category_id: string | null; manufacturer?: Manufacturer | null; category?: { name: string } | null };
type Compatibility = { part_id: string; machine_id: string };
type Category = { id: string; name: string };
type PartCategory = { part_id: string; category_id: string };
type SavedSearch = { query: string; manufacturerId: string; machineId: string; supplyType: string; categoryId: string; machineQuery: string; machineCompanyId: string; machineCategoryId: string; scrollY: number };
const SEARCH_SESSION_KEY = "partsdb-search-state-v1";

const previewParts: Part[] = [
  { id: "1", description: "Sealed deep groove ball bearing", manufacturer_part_number: "6204-2RSH", supply_type: "local", manufacturer: { name: "SKF" } },
  { id: "2", description: "Photoelectric diffuse sensor, 300 mm", manufacturer_part_number: "WTB4-3P2161", supply_type: "dfl", manufacturer: { name: "SICK" } },
  { id: "3", description: "Timing belt, 25 mm width", manufacturer_part_number: "HTD-800-8M-25", supply_type: "local", manufacturer: { name: "Gates" } },
  { id: "4", description: "Pneumatic solenoid valve 5/2 way", manufacturer_part_number: "VUVG-L14-M52", supply_type: "dfl", manufacturer: { name: "Festo" } },
];

export function PartsDashboard({mode='parts'}:{mode?:'parts'|'machines'}) {
  const searchKey=mode==='machines'?'partsdb-machine-search-state-v1':SEARCH_SESSION_KEY;
  const supplyTypes = useSupplyTypes();
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<Part[]>(previewParts);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [compatibility, setCompatibility] = useState<Compatibility[]>([]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [supplyType, setSupplyType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [partCategories, setPartCategories] = useState<PartCategory[]>([]);
  const [machineQuery, setMachineQuery] = useState("");
  const [machineCompanyId, setMachineCompanyId] = useState("");
  const [machineCategoryId, setMachineCategoryId] = useState("");
  const [machineCategories, setMachineCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [repairs,setRepairs]=useState<ApprovedRepair[]>([]),[repairError,setRepairError]=useState("");
  const [error, setError] = useState("");
  const [machineError,setMachineError]=useState("");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [searchRestored, setSearchRestored] = useState(false);
  const scrollRestored = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(searchKey) ?? "null") as SavedSearch | null;
        if (saved) { setQuery(saved.query ?? ""); setManufacturerId(saved.manufacturerId ?? ""); setMachineId(saved.machineId ?? ""); setSupplyType(saved.supplyType ?? ""); setCategoryId(saved.categoryId ?? ""); setMachineQuery(saved.machineQuery ?? ""); setMachineCompanyId(saved.machineCompanyId ?? ""); setMachineCategoryId(saved.machineCategoryId ?? ""); }
      } catch { window.sessionStorage.removeItem(searchKey); }
      setSearchRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchKey]);

  useEffect(() => {
    if (!searchRestored) return;
    let previousScroll = 0;
    try { previousScroll = (JSON.parse(window.sessionStorage.getItem(searchKey) ?? "null") as SavedSearch | null)?.scrollY ?? 0; } catch { /* Invalid state is replaced below. */ }
    window.sessionStorage.setItem(searchKey, JSON.stringify({ query, manufacturerId, machineId, supplyType, categoryId, machineQuery, machineCompanyId, machineCategoryId, scrollY: previousScroll } satisfies SavedSearch));
  }, [searchKey, searchRestored, query, manufacturerId, machineId, supplyType, categoryId, machineQuery, machineCompanyId, machineCategoryId]);

  useEffect(() => {
    if (!searchRestored || loading || scrollRestored.current) return;
    scrollRestored.current = true;
    const timer = window.setTimeout(() => { try { const saved = JSON.parse(window.sessionStorage.getItem(searchKey) ?? "null") as SavedSearch | null; window.scrollTo({ top: saved?.scrollY ?? 0 }); } catch { /* Stay at the top. */ } }, 50);
    return () => window.clearTimeout(timer);
  }, [searchKey, searchRestored, loading]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    Promise.all([
      supabase.from("parts").select("id,description,manufacturer_part_number,supply_type,manufacturer:companies(name)").eq("status", "active").order("description"),
      supabase.from("companies").select("id,name,company_roles!inner(role)").eq("is_active", true).eq("company_roles.role", "manufacturer").order("name"),
      supabase.from("machines").select("id,model,name,notes,manufacturer_id,category_id,manufacturer:companies(id,name),category:machine_categories(name)").eq("is_active", true).order("name"),
      supabase.from("part_machines").select("part_id,machine_id"),
      supabase.from("machine_categories").select("id,name").eq("is_active", true).order("name"),
      supabase.from("categories").select("id,name").eq("is_active", true).order("name"),
      supabase.from("part_categories").select("part_id,category_id"),
      supabase.from("repair_logs").select("id,title,machine_id,machine_name,job_date").eq("publication_status","approved").order("updated_at",{ascending:false}),
    ]).then(([partResult, manufacturerResult, machineResult, compatibilityResult, machineCategoryResult, categoryResult, partCategoryResult, repairResult]) => {
      if (partResult.error) setError(partResult.error.message); else setParts((partResult.data ?? []) as unknown as Part[]);
      setManufacturers((manufacturerResult.data ?? []) as Manufacturer[]);
      setMachines((machineResult.data ?? []) as unknown as Machine[]);if(machineResult.error)setMachineError(machineResult.error.message);
      setCompatibility((compatibilityResult.data ?? []).map((row) => ({ part_id: row.part_id, machine_id: row.machine_id })));
      setMachineCategories((machineCategoryResult.data ?? []) as Array<{ id: string; name: string }>);
      setCategories((categoryResult.data ?? []) as Category[]);
      setPartCategories((partCategoryResult.data ?? []) as PartCategory[]);
      setRepairs(repairResult.data??[]);if(repairResult.error)setRepairError("Approved repair logs could not be loaded. Please reload.");
      setLoading(false);
    });
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return parts.filter((part) => {
      const linkedMachineIds = compatibility.filter((link) => link.part_id === part.id).map((link) => link.machine_id);
      const linkedMachines = machines.filter((machine) => linkedMachineIds.includes(machine.id));
      const matchesText = !term || [part.description, part.manufacturer_part_number, part.manufacturer?.name, ...linkedMachines.flatMap((machine) => [machine.name, machine.model, machine.manufacturer?.name])].some((value) => value?.toLowerCase().includes(term));
      const matchesManufacturer = !manufacturerId || linkedMachines.some((machine) => machine.manufacturer_id === manufacturerId);
      const matchesMachine = !machineId || linkedMachineIds.includes(machineId);
      const matchesSupply = !supplyType || part.supply_type === supplyType;
      const matchesCategory = !categoryId || partCategories.some((link) => link.part_id === part.id && link.category_id === categoryId);
      return matchesText && matchesManufacturer && matchesMachine && matchesSupply && matchesCategory;
    });
  }, [parts, query, compatibility, machines, manufacturerId, machineId, supplyType, categoryId, partCategories]);

  const activePartIds = useMemo(() => new Set(parts.map((part) => part.id)), [parts]);
  const machineIdsWithParts = useMemo(() => new Set(compatibility.filter((link) => activePartIds.has(link.part_id)).map((link) => link.machine_id)), [compatibility, activePartIds]);
  const manufacturerIdsWithParts = useMemo(() => new Set(machines.filter((machine) => machineIdsWithParts.has(machine.id)).map((machine) => machine.manufacturer_id)), [machines, machineIdsWithParts]);
  const compatibleMachinesByPart = useMemo(() => {
    const machineById = new Map(machines.map((machine) => [machine.id, machine]));
    const grouped = new Map<string, Machine[]>();
    compatibility.forEach((link) => {
      const machine = machineById.get(link.machine_id);
      if (machine) grouped.set(link.part_id, [...(grouped.get(link.part_id) ?? []), machine]);
    });
    grouped.forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name)));
    return grouped;
  }, [compatibility, machines]);
  const filteredMachines = useMemo(() => machines.filter((machine) => !manufacturerId || machine.manufacturer_id === manufacturerId), [machines, manufacturerId]);
  const visibleMachines = useMemo(() => { const term = machineQuery.trim().toLowerCase(); return machines.filter((machine) => (!term || [machine.name, machine.model, machine.manufacturer?.name, machine.category?.name].some((value) => value?.toLowerCase().includes(term))) && (!machineCompanyId || machine.manufacturer_id === machineCompanyId) && (!machineCategoryId || machine.category_id === machineCategoryId)); }, [machines, machineQuery, machineCompanyId, machineCategoryId]);
  const hasPartLookup = Boolean(query.trim() || manufacturerId || machineId || supplyType || categoryId);
  const hasMachineLookup = Boolean(machineQuery.trim() || machineCompanyId || machineCategoryId);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      if (manufacturerId && !manufacturerIdsWithParts.has(manufacturerId)) setManufacturerId("");
      if (machineId && !machineIdsWithParts.has(machineId)) setMachineId("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, manufacturerId, machineId, manufacturerIdsWithParts, machineIdsWithParts]);

  function selectManufacturer(value: string) {
    setManufacturerId(value);
    if (machineId && !machines.some((machine) => machine.id === machineId && (!value || machine.manufacturer_id === value))) setMachineId("");
  }

  function rememberScroll() { try { const saved = JSON.parse(window.sessionStorage.getItem(searchKey) ?? "{}") as Partial<SavedSearch>; window.sessionStorage.setItem(searchKey, JSON.stringify({ ...saved, scrollY: window.scrollY })); } catch { /* Navigation should still continue. */ } }
  function clearFilters() { setQuery(""); setManufacturerId(""); setMachineId(""); setSupplyType(""); setCategoryId(""); window.sessionStorage.removeItem(searchKey); window.scrollTo({ top: 0, behavior: "smooth" }); }

  return (
    <AppShell>{(_, siteMode) => <main className="workspace">
      <section className="workspace-heading">
        <div><p className="eyebrow accent">{mode==='parts'?'Parts':'Machines'}</p><h1>{mode==='parts'?'Find the part you need':'Find a machine'}</h1><p>{mode==='parts'?'Search approved ordering information across machines, suppliers and manufacturers.':'Search your machines and open their compatible parts and approved repair guides.'}</p></div>
        {mode==='parts'&&(siteMode === "standby" ? <span className="button primary disabled" title="Editing is disabled in standby mode"><PlusIcon/>Add part</span> : <Link className="button primary" href="/parts/new"><PlusIcon/>Add part</Link>)}
      </section>

      {mode==='parts'&&<><section className="search-surface">
        <div className="search-box"><SearchIcon/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description, part number or manufacturer…" aria-label="Search parts"/><kbd>⌘ K</kbd></div>
        <div className="filter-row">
          <label>Manufacturer<select value={manufacturerId} onChange={(event) => selectManufacturer(event.target.value)}><option value="">All manufacturers</option>{manufacturers.map((manufacturer) => <option key={manufacturer.id} value={manufacturer.id} disabled={!manufacturerIdsWithParts.has(manufacturer.id)}>{manufacturer.name}{manufacturerIdsWithParts.has(manufacturer.id) ? "" : " · no parts"}</option>)}</select></label>
          <label>Machine<select value={machineId} onChange={(event) => setMachineId(event.target.value)}><option value="">All machines</option>{filteredMachines.map((machine) => <option key={machine.id} value={machine.id} disabled={!machineIdsWithParts.has(machine.id)}>{machine.name ?? machine.model}{machine.name && machine.model ? ` · ${machine.model}` : ""}{machineIdsWithParts.has(machine.id) ? "" : " · no parts"}</option>)}</select></label>
          <label>Supply type<select value={supplyType} onChange={(event) => setSupplyType(event.target.value)}><option value="">All supply types</option>{supplyTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <button className="clear-button" onClick={clearFilters}>Clear filters</button>
        </div>
      </section>

      <section className="results-section">
        <div className="results-meta"><div><h2>Approved parts</h2><span>{hasPartLookup ? `${visible.length} results` : `${parts.length} available`}</span></div><label>Sort<select><option>Most relevant</option><option>Description A–Z</option></select></label></div>
        <div className="parts-table" aria-live="polite">
          <div className="table-head"><span>Part</span><span>Compatible machines</span><span>Part number</span><span>Supply</span><span></span></div>
          {loading ? <div className="empty-row">Loading approved parts…</div> : error ? <div className="empty-row">Parts could not be loaded: {error}</div> : hasPartLookup ? visible.map((part) => { const linkedMachines = compatibleMachinesByPart.get(part.id) ?? []; return <div className="bom-part-result" key={part.id}><a className="part-row" href={`/parts/${part.id}`} onClick={rememberScroll}>
            <span className="part-title"><i><BoxIcon/></i><span><strong>{part.description}</strong><small>{part.manufacturer_part_number ?? "No part number"}</small></span></span>
            <span className="machine-summary"><strong>{linkedMachines.length} {linkedMachines.length === 1 ? "machine" : "machines"}</strong><small>{linkedMachines.length ? <>{linkedMachines.slice(0, 2).map((machine) => machine.name).join(" · ")}{linkedMachines.length > 2 ? ` · +${linkedMachines.length - 2} more` : ""}</> : "No machines linked"}</small></span><span className="mono">{part.manufacturer_part_number ?? "—"}</span><span><em className={`supply ${part.supply_type}`}>{supplyTypes.find((item) => item.code === part.supply_type)?.name ?? part.supply_type}</em></span><span className="row-arrow"><ArrowIcon/></span>
          </a><AddToBomButton partId={part.id} compact/></div>; }) : <div className="empty-row lookup-prompt"><strong>{parts.length} approved parts available to look up.</strong><span>Enter a search or select a filter to view matching parts.</span></div>}
          {!loading && !error && hasPartLookup && visible.length === 0 && <div className="empty-row">No approved parts match the selected search and filters.</div>}
        </div>
      </section>
      </>}
      {mode==='machines'&&<section className="results-section machine-search-section">
        <div className="results-meta"><div><h2>Search machines</h2><span>{hasMachineLookup ? `${visibleMachines.length} results` : `${machines.length} available`}</span></div></div>
        <div className="search-surface"><div className="search-box"><SearchIcon/><input value={machineQuery} onChange={(e) => setMachineQuery(e.target.value)} placeholder="Search machine name or model…" aria-label="Search machines"/></div><div className="filter-row"><label>Company<select value={machineCompanyId} onChange={(e) => setMachineCompanyId(e.target.value)}><option value="">All companies</option>{manufacturers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Category<select value={machineCategoryId} onChange={(e) => setMachineCategoryId(e.target.value)}><option value="">All categories</option>{machineCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="clear-button" onClick={() => { setMachineQuery(""); setMachineCompanyId(""); setMachineCategoryId(""); }}>Clear filters</button></div></div>
        <div className="machine-results">{loading ? <div className="empty-row">Loading machines…</div> : machineError ? <div className="empty-row">Machines could not be loaded: {machineError}</div> : hasMachineLookup ? visibleMachines.map((machine) => <a href={`/machines/${machine.id}`} key={machine.id}><strong>{machine.name}</strong><span>{machine.manufacturer?.name ?? "—"}{machine.model ? ` · ${machine.model}` : ""}</span><small>{machine.category?.name ?? "Uncategorised"}</small><ArrowIcon/></a>) : <div className="empty-row lookup-prompt"><strong>{machines.length} machines available to look up.</strong><span>Enter a search or select a filter to view matching machines.</span></div>}{!loading && !machineError && hasMachineLookup && !visibleMachines.length && <div className="empty-row">No machines match the selected search and filters.</div>}</div>
        {hasMachineLookup&&!machineError&&<section className="results-section"><div className="results-meta"><div><h2>Approved repair logs</h2><span>For the machines matching your search</span></div></div><div className="parts-table">{repairError?<div className="empty-row">{repairError}</div>:loading?<div className="empty-row">Loading repair logs…</div>:repairs.filter(r=>visibleMachines.some(m=>m.id===r.machine_id)).map(r=><a key={r.id} className="part-row machine-part-row" href={`/workshop/logs?log=${r.id}`} onClick={rememberScroll}><span className="part-title"><span><strong>{r.title}</strong><small>{machines.find(m=>m.id===r.machine_id)?.name??r.machine_name} · {r.job_date}</small></span></span><span className="row-arrow"><ArrowIcon/></span></a>)}{!loading&&!repairError&&!repairs.some(r=>visibleMachines.some(m=>m.id===r.machine_id))&&<div className="empty-row">No approved repair logs for these machines yet.</div>}</div></section>}
      </section>}
    </main>}</AppShell>
  );
}
