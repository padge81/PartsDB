"use client";
import { useEffect, useMemo, useState } from "react";

export type SearchableMachine = { id: string; name: string; model: string | null; manufacturer?: { id: string; name: string } | null };

export function MachineSearchSelect({ machines, selectedId, manufacturerId, onSelect }: { machines: SearchableMachine[]; selectedId: string; manufacturerId?: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => { const selected = machines.find((machine) => machine.id === selectedId); if (selected) setQuery(selected.name); else if (!selectedId) setQuery(""); }, 0); return () => window.clearTimeout(timer); }, [machines, selectedId]);
  const results = useMemo(() => { const term = query.trim().toLowerCase(); return machines.filter((machine) => (!manufacturerId || machine.manufacturer?.id === manufacturerId) && (!term || [machine.name, machine.model, machine.manufacturer?.name].some((value) => value?.toLowerCase().includes(term)))).slice(0, 30); }, [machines, manufacturerId, query]);
  function choose(machine: SearchableMachine) { setQuery(machine.name); setOpen(false); onSelect(machine.id); }
  return <div className="machine-search-select"><input value={query} placeholder="Type to search machine name…" autoComplete="off" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (selectedId) onSelect(""); }} onBlur={() => window.setTimeout(() => setOpen(false), 120)}/>{open && <div className="machine-search-options" role="listbox">{results.length ? results.map((machine) => <button type="button" role="option" aria-selected={machine.id === selectedId} key={machine.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(machine)}><strong>{machine.name}</strong><small>{[machine.manufacturer?.name, machine.model].filter(Boolean).join(" · ")}</small></button>) : <p>No machines match this search.</p>}</div>}</div>;
}
