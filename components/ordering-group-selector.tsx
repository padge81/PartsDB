"use client";

import { useMemo, useState } from "react";
import type { OrderingPartOption } from "../lib/use-ordering-parts";

export function OrderingGroupSelector({ parts, selectedIds, machineIds, onChange }: { parts: OrderingPartOption[]; selectedIds: string[]; machineIds: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const normalisedMachineIds = useMemo(() => [...new Set(machineIds.filter(Boolean))], [machineIds]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return parts.filter((part) => {
      const selected = selectedIds.includes(part.id);
      const compatible = normalisedMachineIds.length > 0 && part.machineIds.some((id) => normalisedMachineIds.includes(id));
      const matches = !term || [part.description, part.manufacturerPartNumber, ...part.machineNames].some((value) => value?.toLowerCase().includes(term));
      return (selected || compatible) && matches;
    });
  }, [parts, selectedIds, normalisedMachineIds, query]);

  function toggle(part: OrderingPartOption, checked: boolean) {
    if (!checked) { onChange(selectedIds.filter((id) => id !== part.id)); return; }
    onChange([...new Set([...selectedIds, part.id, ...part.groupMemberIds])]);
  }

  return <div className="ordering-group-selector">
    <label className="ordering-search">Search compatible parts<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Description, part number or machine…"/></label>
    {!normalisedMachineIds.length ? <p className="empty-detail">Select at least one machine to see compatible parts.</p> : visible.length ? <div className="ordering-checkbox-list">{visible.map((part) => <label key={part.id}>
      <input type="checkbox" checked={selectedIds.includes(part.id)} onChange={(event) => toggle(part, event.target.checked)}/>
      <span><strong>{part.description}</strong><small>{part.manufacturerPartNumber ?? "No manufacturer part number"}</small><small>{part.machineNames.join(" · ") || "Compatible machine"}</small></span>
    </label>)}</div> : <p className="empty-detail">No compatible parts match this search.</p>}
    <p className="ordering-group-note">Selecting a part that already belongs to a group includes its complete “Consider ordering with” group.</p>
  </div>;
}
