"use client";
import {SearchableSelect} from "./searchable-select";

export type SearchableMachine = { id: string; name: string; model: string | null; manufacturer?: { id: string; name: string } | null };

export function MachineSearchSelect({ machines, selectedId, manufacturerId, onSelect }: { machines: SearchableMachine[]; selectedId: string; manufacturerId?: string; onSelect: (id: string) => void }) {
  return <SearchableSelect searchLabel="machines" value={selectedId} onChange={event=>onSelect(event.target.value)}>
    <option value="">Select machine</option>
    {machines.filter(machine=>!manufacturerId||machine.manufacturer?.id===manufacturerId).map(machine=>
      <option key={machine.id} value={machine.id}>{[machine.name,machine.model,machine.manufacturer?.name].filter(Boolean).join(" · ")}</option>
    )}
  </SearchableSelect>;
}
