type Part = { id: string; description: string; manufacturer_part_number: string | null; supply_type: string; manufacturer?: { name: string } | null };
type Machine = { id: string; name: string; model: string | null; manufacturer_id: string; manufacturer?: { name: string } | null };
type Link = { part_id: string; machine_id: string };
type CategoryLink = { part_id: string; category_id: string };
export type PartSort = "description" | "description-desc" | "number";

export function buildPartSearchIndex<P extends Part, M extends Machine>(parts: P[], machines: M[], links: Link[], categories: CategoryLink[]) {
  const machineById = new Map(machines.map(machine => [machine.id, machine]));
  const machinesByPart = new Map<string, M[]>();
  for (const link of links) {
    const machine = machineById.get(link.machine_id);
    if (!machine) continue;
    const linked = machinesByPart.get(link.part_id) ?? [];
    linked.push(machine);
    machinesByPart.set(link.part_id, linked);
  }
  for (const linked of machinesByPart.values()) linked.sort((a, b) => a.name.localeCompare(b.name));
  const categoriesByPart = new Map<string, Set<string>>();
  for (const link of categories) {
    if (!categoriesByPart.has(link.part_id)) categoriesByPart.set(link.part_id, new Set());
    categoriesByPart.get(link.part_id)!.add(link.category_id);
  }
  return parts.map(part => {
    const linked = machinesByPart.get(part.id) ?? [];
    return {
      part, machines: linked,
      machineIds: new Set(linked.map(machine => machine.id)),
      manufacturerIds: new Set(linked.map(machine => machine.manufacturer_id)),
      categoryIds: categoriesByPart.get(part.id) ?? new Set<string>(),
      text: [part.description, part.manufacturer_part_number, part.manufacturer?.name,
        ...linked.flatMap(machine => [machine.name, machine.model, machine.manufacturer?.name])]
        .filter(Boolean).join("\n").toLowerCase(),
    };
  });
}

export function searchParts<P extends Part, M extends Machine>(
  index: ReturnType<typeof buildPartSearchIndex<P, M>>,
  filters: { query: string; machineId: string; manufacturerId: string; supplyType: string; categoryId: string },
  sort: PartSort = "description",
): P[] {
  const term = filters.query.trim().toLowerCase();
  const matches = index.filter(row =>
    (!term || row.text.includes(term)) &&
    (!filters.machineId || row.machineIds.has(filters.machineId)) &&
    (!filters.manufacturerId || row.manufacturerIds.has(filters.manufacturerId)) &&
    (!filters.supplyType || row.part.supply_type === filters.supplyType) &&
    (!filters.categoryId || row.categoryIds.has(filters.categoryId))
  ).map(row => row.part);
  return matches.sort((a, b) => {
    if (sort === "number") {
      const left = a.manufacturer_part_number ?? "", right = b.manufacturer_part_number ?? "";
      if (!!left !== !!right) return left ? -1 : 1;
      const compared = left.localeCompare(right, undefined, {numeric: true});
      if (compared) return compared;
    }
    return (sort === "description-desc" ? -1 : 1) * a.description.localeCompare(b.description) || a.id.localeCompare(b.id);
  });
}
