"use client";

import { useState } from "react";
import { addToBom } from "../lib/bom-cart";
import { PlusIcon } from "./icons";

export function AddToBomButton({ partId, compact = false }: { partId: string; compact?: boolean }) {
  const [added, setAdded] = useState(false);
  function add() { addToBom(partId); setAdded(true); window.setTimeout(() => setAdded(false), 1200); }
  return <button type="button" className={`button secondary bom-add-button${compact ? " compact" : ""}`} onClick={add}><PlusIcon/>{added ? "Added" : "Add to BOM"}</button>;
}
