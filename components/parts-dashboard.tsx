"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { ArrowIcon, BoxIcon, PlusIcon, SearchIcon } from "./icons";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase";

type Part = { id: string; description: string; manufacturer_part_number: string | null; internal_part_number: string | null; supply_type: string; manufacturer?: { name: string } | null };
type Manufacturer = { id: string; name: string };
type Machine = { id: string; model: string; name: string | null; manufacturer_id: string; manufacturer?: Manufacturer | null };
type Compatibility = { part_id: string; machine_id: string };

const previewParts: Part[] = [
  { id: "1", description: "Sealed deep groove ball bearing", manufacturer_part_number: "6204-2RSH", internal_part_number: "BRG-0204", supply_type: "local", manufacturer: { name: "SKF" } },
  { id: "2", description: "Photoelectric diffuse sensor, 300 mm", manufacturer_part_number: "WTB4-3P2161", internal_part_number: "SNS-1108", supply_type: "dfl", manufacturer: { name: "SICK" } },
  { id: "3", description: "Timing belt, 25 mm width", manufacturer_part_number: "HTD-800-8M-25", internal_part_number: "BLT-0800", supply_type: "local", manufacturer: { name: "Gates" } },
  { id: "4", description: "Pneumatic solenoid valve 5/2 way", manufacturer_part_number: "VUVG-L14-M52", internal_part_number: "VLV-0522", supply_type: "dfl", manufacturer: { name: "Festo" } },
];

export function PartsDashboard() {
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<Part[]>(previewParts);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [compatibility, setCompatibility] = useState<Compatibility[]>([]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [supplyType, setSupplyType] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    Promise.all([
      supabase.from("parts").select("id,description,manufacturer_part_number,internal_part_number,supply_type,manufacturer:manufacturers(name)").eq("status", "active").order("description"),
      supabase.from("manufacturers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("machines").select("id,model,name,manufacturer_id,manufacturer:manufacturers(id,name)").eq("is_active", true).order("model"),
      supabase.from("part_machine_revisions").select("part_id,revision:machine_revisions(machine_id)"),
    ]).then(([partResult, manufacturerResult, machineResult, compatibilityResult]) => {
      if (partResult.error) setError(partResult.error.message); else setParts((partResult.data ?? []) as unknown as Part[]);
      setManufacturers((manufacturerResult.data ?? []) as Manufacturer[]);
      setMachines((machineResult.data ?? []) as unknown as Machine[]);
      setCompatibility((compatibilityResult.data ?? []).flatMap((row) => {
        const revision = row.revision as unknown as { machine_id: string } | null;
        return revision?.machine_id ? [{ part_id: row.part_id, machine_id: revision.machine_id }] : [];
      }));
      setLoading(false);
    });
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return parts.filter((part) => {
      const linkedMachineIds = compatibility.filter((link) => link.part_id === part.id).map((link) => link.machine_id);
      const linkedMachines = machines.filter((machine) => linkedMachineIds.includes(machine.id));
      const matchesText = !term || [part.description, part.manufacturer_part_number, part.internal_part_number, part.manufacturer?.name, ...linkedMachines.flatMap((machine) => [machine.name, machine.model, machine.manufacturer?.name])].some((value) => value?.toLowerCase().includes(term));
      const matchesManufacturer = !manufacturerId || linkedMachines.some((machine) => machine.manufacturer_id === manufacturerId);
      const matchesMachine = !machineId || linkedMachineIds.includes(machineId);
      const matchesSupply = !supplyType || part.supply_type === supplyType;
      return matchesText && matchesManufacturer && matchesMachine && matchesSupply;
    });
  }, [parts, query, compatibility, machines, manufacturerId, machineId, supplyType]);

  const filteredMachines = useMemo(() => machines.filter((machine) => !manufacturerId || machine.manufacturer_id === manufacturerId), [machines, manufacturerId]);

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
          <label>Supply type<select value={supplyType} onChange={(event) => setSupplyType(event.target.value)}><option value="">All supply types</option><option value="local">Local</option><option value="dfl">DFL</option><option value="unknown">Unknown</option></select></label>
          <button className="clear-button" onClick={clearFilters}>Clear filters</button>
        </div>
      </section>

      <section className="results-section">
        <div className="results-meta"><div><h2>Approved parts</h2><span>{visible.length} results</span></div><label>Sort<select><option>Most relevant</option><option>Description A–Z</option></select></label></div>
        <div className="parts-table" aria-live="polite">
          <div className="table-head"><span>Part</span><span>Manufacturer</span><span>Part number</span><span>Supply</span><span></span></div>
          {loading ? <div className="empty-row">Loading approved parts…</div> : error ? <div className="empty-row">Parts could not be loaded: {error}</div> : visible.map((part) => <a className="part-row" key={part.id} href={`/parts/${part.id}`}>
            <span className="part-title"><i><BoxIcon/></i><span><strong>{part.description}</strong><small>{part.internal_part_number ?? "No internal number"}</small></span></span>
            <span>{part.manufacturer?.name ?? "—"}</span><span className="mono">{part.manufacturer_part_number ?? "—"}</span><span><em className={`supply ${part.supply_type}`}>{part.supply_type.toUpperCase()}</em></span><span className="row-arrow"><ArrowIcon/></span>
          </a>)}
          {!loading && !error && visible.length === 0 && <div className="empty-row">No approved parts match the selected search and filters.</div>}
        </div>
      </section>
    </main>}</AppShell>
  );
}
