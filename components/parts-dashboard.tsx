"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { ArrowIcon, BoxIcon, PlusIcon, SearchIcon } from "./icons";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase";
import { useSupplyTypes } from "../lib/use-supply-types";

type Part = { id: string; description: string; manufacturer_part_number: string | null; supply_type: string; manufacturer?: { name: string } | null };
type Manufacturer = { id: string; name: string };
type Machine = { id: string; model: string | null; name: string; notes: string | null; manufacturer_id: string; category_id: string | null; manufacturer?: Manufacturer | null; category?: { name: string } | null };
type Compatibility = { part_id: string; machine_id: string };

const previewParts: Part[] = [
  { id: "1", description: "Sealed deep groove ball bearing", manufacturer_part_number: "6204-2RSH", supply_type: "local", manufacturer: { name: "SKF" } },
  { id: "2", description: "Photoelectric diffuse sensor, 300 mm", manufacturer_part_number: "WTB4-3P2161", supply_type: "dfl", manufacturer: { name: "SICK" } },
  { id: "3", description: "Timing belt, 25 mm width", manufacturer_part_number: "HTD-800-8M-25", supply_type: "local", manufacturer: { name: "Gates" } },
  { id: "4", description: "Pneumatic solenoid valve 5/2 way", manufacturer_part_number: "VUVG-L14-M52", supply_type: "dfl", manufacturer: { name: "Festo" } },
];

export function PartsDashboard() {
  const supplyTypes = useSupplyTypes();
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<Part[]>(previewParts);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [compatibility, setCompatibility] = useState<Compatibility[]>([]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [supplyType, setSupplyType] = useState("");
  const [machineQuery, setMachineQuery] = useState("");
  const [machineCompanyId, setMachineCompanyId] = useState("");
  const [machineCategoryId, setMachineCategoryId] = useState("");
  const [machineCategories, setMachineCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    Promise.all([
      supabase.from("parts").select("id,description,manufacturer_part_number,supply_type,manufacturer:companies(name)").eq("status", "active").order("description"),
      supabase.from("companies").select("id,name,company_roles!inner(role)").eq("is_active", true).eq("company_roles.role", "manufacturer").order("name"),
      supabase.from("machines").select("id,model,name,notes,manufacturer_id,category_id,manufacturer:companies(id,name),category:machine_categories(name)").eq("is_active", true).order("name"),
      supabase.from("part_machines").select("part_id,machine_id"),
      supabase.from("machine_categories").select("id,name").eq("is_active", true).order("name"),
    ]).then(([partResult, manufacturerResult, machineResult, compatibilityResult, machineCategoryResult]) => {
      if (partResult.error) setError(partResult.error.message); else setParts((partResult.data ?? []) as unknown as Part[]);
      setManufacturers((manufacturerResult.data ?? []) as Manufacturer[]);
      setMachines((machineResult.data ?? []) as unknown as Machine[]);
      setCompatibility((compatibilityResult.data ?? []).map((row) => ({ part_id: row.part_id, machine_id: row.machine_id })));
      setMachineCategories((machineCategoryResult.data ?? []) as Array<{ id: string; name: string }>);
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
      return matchesText && matchesManufacturer && matchesMachine && matchesSupply;
    });
  }, [parts, query, compatibility, machines, manufacturerId, machineId, supplyType]);

  const filteredMachines = useMemo(() => machines.filter((machine) => !manufacturerId || machine.manufacturer_id === manufacturerId), [machines, manufacturerId]);
  const visibleMachines = useMemo(() => { const term = machineQuery.trim().toLowerCase(); return machines.filter((machine) => (!term || [machine.name, machine.model, machine.manufacturer?.name, machine.category?.name].some((value) => value?.toLowerCase().includes(term))) && (!machineCompanyId || machine.manufacturer_id === machineCompanyId) && (!machineCategoryId || machine.category_id === machineCategoryId)); }, [machines, machineQuery, machineCompanyId, machineCategoryId]);

  function selectManufacturer(value: string) {
    setManufacturerId(value);
    if (machineId && !machines.some((machine) => machine.id === machineId && (!value || machine.manufacturer_id === value))) setMachineId("");
  }

  function clearFilters() { setQuery(""); setManufacturerId(""); setMachineId(""); setSupplyType(""); }

  return (
    <AppShell>{() => <main className="workspace">
      <section className="workspace-heading">
        <div><p className="eyebrow accent">Parts repository</p><h1>Find the part you need</h1><p>Search approved ordering information across machines, suppliers and manufacturers.</p></div>
        <Link className="button primary" href="/parts/new"><PlusIcon/>Add part</Link>
      </section>

      <section className="search-surface">
        <div className="search-box"><SearchIcon/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description, part number or manufacturer…" aria-label="Search parts"/><kbd>⌘ K</kbd></div>
        <div className="filter-row">
          <label>Manufacturer<select value={manufacturerId} onChange={(event) => selectManufacturer(event.target.value)}><option value="">All manufacturers</option>{manufacturers.map((manufacturer) => <option key={manufacturer.id} value={manufacturer.id}>{manufacturer.name}</option>)}</select></label>
          <label>Machine<select value={machineId} onChange={(event) => setMachineId(event.target.value)}><option value="">All machines</option>{filteredMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name ?? machine.model}{machine.name ? ` · ${machine.model}` : ""}</option>)}</select></label>
          <label>Supply type<select value={supplyType} onChange={(event) => setSupplyType(event.target.value)}><option value="">All supply types</option>{supplyTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <button className="clear-button" onClick={clearFilters}>Clear filters</button>
        </div>
      </section>

      <section className="results-section">
        <div className="results-meta"><div><h2>Approved parts</h2><span>{visible.length} results</span></div><label>Sort<select><option>Most relevant</option><option>Description A–Z</option></select></label></div>
        <div className="parts-table" aria-live="polite">
          <div className="table-head"><span>Part</span><span>Manufacturer</span><span>Part number</span><span>Supply</span><span></span></div>
          {loading ? <div className="empty-row">Loading approved parts…</div> : error ? <div className="empty-row">Parts could not be loaded: {error}</div> : visible.map((part) => <a className="part-row" key={part.id} href={`/parts/${part.id}`}>
            <span className="part-title"><i><BoxIcon/></i><span><strong>{part.description}</strong><small>{part.manufacturer_part_number ?? "No part number"}</small></span></span>
            <span>{part.manufacturer?.name ?? "—"}</span><span className="mono">{part.manufacturer_part_number ?? "—"}</span><span><em className={`supply ${part.supply_type}`}>{supplyTypes.find((item) => item.code === part.supply_type)?.name ?? part.supply_type}</em></span><span className="row-arrow"><ArrowIcon/></span>
          </a>)}
          {!loading && !error && visible.length === 0 && <div className="empty-row">No approved parts match the selected search and filters.</div>}
        </div>
      </section>
      <section className="results-section machine-search-section">
        <div className="results-meta"><div><h2>Search machines</h2><span>{visibleMachines.length} results</span></div></div>
        <div className="search-surface"><div className="search-box"><SearchIcon/><input value={machineQuery} onChange={(e) => setMachineQuery(e.target.value)} placeholder="Search machine name or model…" aria-label="Search machines"/></div><div className="filter-row"><label>Company<select value={machineCompanyId} onChange={(e) => setMachineCompanyId(e.target.value)}><option value="">All companies</option>{manufacturers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Category<select value={machineCategoryId} onChange={(e) => setMachineCategoryId(e.target.value)}><option value="">All categories</option>{machineCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="clear-button" onClick={() => { setMachineQuery(""); setMachineCompanyId(""); setMachineCategoryId(""); }}>Clear filters</button></div></div>
        <div className="machine-results">{visibleMachines.map((machine) => <a href={`/machines/${machine.id}`} key={machine.id}><strong>{machine.name}</strong><span>{machine.manufacturer?.name ?? "—"}{machine.model ? ` · ${machine.model}` : ""}</span><small>{machine.category?.name ?? "Uncategorised"}</small><ArrowIcon/></a>)}{!loading && !visibleMachines.length && <div className="empty-row">No machines match the selected search and filters.</div>}</div>
      </section>
    </main>}</AppShell>
  );
}
