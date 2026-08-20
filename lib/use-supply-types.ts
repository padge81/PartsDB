"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./supabase";

export type SupplyTypeOption = { code: string; name: string };

const fallbackSupplyTypes: SupplyTypeOption[] = [
  { code: "unknown", name: "Unknown" },
  { code: "local", name: "Local" },
  { code: "dfl", name: "DFL" },
];

export function useSupplyTypes() {
  const [supplyTypes, setSupplyTypes] = useState<SupplyTypeOption[]>(fallbackSupplyTypes);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    supabase.from("supply_types").select("code,name").eq("is_active", true).order("name").then(({ data }) => {
      if (data?.length) setSupplyTypes(data as SupplyTypeOption[]);
    });
  }, []);

  return supplyTypes;
}
