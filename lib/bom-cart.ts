"use client";

import { useEffect, useState } from "react";

export type BomCartItem = { partId: string; quantity: number; notes: string };
const STORAGE_KEY = "partsdb-bom-cart-v1";
const CHANGE_EVENT = "partsdb-bom-cart-change";

export function readBomCart(): BomCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as BomCartItem[];
    return Array.isArray(value) ? value.filter((item) => item.partId && Number.isFinite(item.quantity)).map((item) => ({ ...item, quantity: Math.max(1, Math.floor(item.quantity)), notes: item.notes ?? "" })) : [];
  } catch { return []; }
}

function writeBomCart(items: BomCartItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function addToBom(partId: string) {
  const items = readBomCart(), existing = items.find((item) => item.partId === partId);
  writeBomCart(existing ? items.map((item) => item.partId === partId ? { ...item, quantity: item.quantity + 1 } : item) : [...items, { partId, quantity: 1, notes: "" }]);
}
export function updateBomItem(partId: string, changes: Partial<Pick<BomCartItem, "quantity" | "notes">>) { writeBomCart(readBomCart().map((item) => item.partId === partId ? { ...item, ...changes, quantity: Math.max(1, Math.floor(changes.quantity ?? item.quantity)) } : item)); }
export function removeFromBom(partId: string) { writeBomCart(readBomCart().filter((item) => item.partId !== partId)); }
export function clearBomCart() { writeBomCart([]); }

export function useBomCart() {
  const [items, setItems] = useState<BomCartItem[]>([]);
  useEffect(() => { const refresh = () => setItems(readBomCart()); refresh(); window.addEventListener(CHANGE_EVENT, refresh); window.addEventListener("storage", refresh); return () => { window.removeEventListener(CHANGE_EVENT, refresh); window.removeEventListener("storage", refresh); }; }, []);
  return items;
}
