"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { ArrowIcon, BoxIcon, PlusIcon, SearchIcon } from "./icons";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase";

type Part = { id: string; description: string; manufacturer_part_number: string | null; internal_part_number: string | null; supply_type: string; manufacturer?: { name: string } | null };

const previewParts: Part[] = [
  { id: "1", description: "Sealed deep groove ball bearing", manufacturer_part_number: "6204-2RSH", internal_part_number: "BRG-0204", supply_type: "local", manufacturer: { name: "SKF" } },
  { id: "2", description: "Photoelectric diffuse sensor, 300 mm", manufacturer_part_number: "WTB4-3P2161", internal_part_number: "SNS-1108", supply_type: "dfl", manufacturer: { name: "SICK" } },
  { id: "3", description: "Timing belt, 25 mm width", manufacturer_part_number: "HTD-800-8M-25", internal_part_number: "BLT-0800", supply_type: "local", manufacturer: { name: "Gates" } },
  { id: "4", description: "Pneumatic solenoid valve 5/2 way", manufacturer_part_number: "VUVG-L14-M52", internal_part_number: "VLV-0522", supply_type: "dfl", manufacturer: { name: "Festo" } },
];

export function PartsDashboard() {
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<Part[]>(previewParts);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.from("parts").select("id, description, manufacturer_part_number, internal_part_number, supply_type, manufacturer:manufacturers(name)").eq("status", "active").order("description").limit(30)
      .then(({ data }) => { if (data) setParts(data as unknown as Part[]); setLoading(false); });
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return parts;
    return parts.filter((part) => [part.description, part.manufacturer_part_number, part.internal_part_number, part.manufacturer?.name].some((value) => value?.toLowerCase().includes(term)));
  }, [parts, query]);

  return (
    <AppShell>{() => <main className="workspace">
      <section className="workspace-heading">
        <div><p className="eyebrow accent">Parts repository</p><h1>Find the part you need</h1><p>Search approved ordering information across machines, suppliers and manufacturers.</p></div>
        <Link className="button primary" href="/parts/new"><PlusIcon/>Add part</Link>
      </section>

      <section className="search-surface">
        <div className="search-box"><SearchIcon/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description, part number or manufacturer…" aria-label="Search parts"/><kbd>⌘ K</kbd></div>
        <div className="filter-row">
          <label>Machine<select defaultValue=""><option value="">All machines</option><option>Packaging line</option><option>Conveyor</option></select></label>
          <label>Manufacturer<select defaultValue=""><option value="">All manufacturers</option><option>SKF</option><option>Festo</option><option>SICK</option></select></label>
          <label>Supply type<select defaultValue=""><option value="">All supply types</option><option>Local</option><option>DFL</option></select></label>
          <button className="clear-button" onClick={() => setQuery("")}>Clear filters</button>
        </div>
      </section>

      <section className="results-section">
        <div className="results-meta"><div><h2>Approved parts</h2><span>{visible.length} results</span></div><label>Sort<select><option>Most relevant</option><option>Description A–Z</option></select></label></div>
        <div className="parts-table" aria-live="polite">
          <div className="table-head"><span>Part</span><span>Manufacturer</span><span>Part number</span><span>Supply</span><span></span></div>
          {loading ? <div className="empty-row">Loading approved parts…</div> : visible.map((part) => <a className="part-row" key={part.id} href={`/parts/${part.id}`}>
            <span className="part-title"><i><BoxIcon/></i><span><strong>{part.description}</strong><small>{part.internal_part_number ?? "No internal number"}</small></span></span>
            <span>{part.manufacturer?.name ?? "—"}</span><span className="mono">{part.manufacturer_part_number ?? "—"}</span><span><em className={`supply ${part.supply_type}`}>{part.supply_type.toUpperCase()}</em></span><span className="row-arrow"><ArrowIcon/></span>
          </a>)}
          {!loading && visible.length === 0 && <div className="empty-row">No approved parts match “{query}”. Try another part number or description.</div>}
        </div>
      </section>
    </main>}</AppShell>
  );
}
