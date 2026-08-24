"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./supabase";

export type OrderingPartOption = {
  id: string;
  description: string;
  manufacturerPartNumber: string | null;
  machineIds: string[];
  machineNames: string[];
  groupMemberIds: string[];
};

type PartRow = { id: string; description: string; manufacturer_part_number: string | null };
type MachineLink = { part_id: string; machine_id: string; machine?: { name: string | null; model: string | null } | null };
type GroupLink = { group_id: string; part_id: string };

export function useOrderingParts(excludePartId?: string) {
  const [parts, setParts] = useState<OrderingPartOption[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    Promise.all([
      supabase.from("parts").select("id,description,manufacturer_part_number").eq("status", "active").order("description"),
      supabase.from("part_machines").select("part_id,machine_id,machine:machines(name,model)"),
      supabase.from("part_order_group_members").select("group_id,part_id"),
    ]).then(([partResult, machineResult, groupResult]) => {
      const rows = (partResult.data ?? []) as PartRow[];
      const machineLinks = (machineResult.data ?? []) as unknown as MachineLink[];
      const groupLinks = (groupResult.data ?? []) as GroupLink[];
      const groupByPart = new Map(groupLinks.map((link) => [link.part_id, link.group_id]));
      const membersByGroup = new Map<string, string[]>();
      for (const link of groupLinks) membersByGroup.set(link.group_id, [...(membersByGroup.get(link.group_id) ?? []), link.part_id]);
      setParts(rows.filter((part) => part.id !== excludePartId).map((part) => {
        const linkedMachines = machineLinks.filter((link) => link.part_id === part.id);
        const groupId = groupByPart.get(part.id);
        return {
          id: part.id,
          description: part.description,
          manufacturerPartNumber: part.manufacturer_part_number,
          machineIds: linkedMachines.map((link) => link.machine_id),
          machineNames: linkedMachines.map((link) => link.machine?.name ?? link.machine?.model ?? "Machine"),
          groupMemberIds: groupId ? (membersByGroup.get(groupId) ?? []).filter((id) => id !== part.id && id !== excludePartId) : [],
        };
      }));
    });
  }, [excludePartId]);

  return parts;
}
