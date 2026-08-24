"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { ArrowIcon, BoxIcon } from "./icons";
import { getSupabaseBrowserClient } from "../lib/supabase";

type Machine = { id: string; name: string; model: string | null; notes: string | null; manufacturer?: { name: string } | null; category?: { name: string } | null };
type Part = { id: string; description: string; manufacturer_part_number: string | null };

export function MachineDetails({ machineId }: { machineId: string }) {
  const [machine, setMachine] = useState<Machine | null>(null), [parts, setParts] = useState<Part[]>([]), [imageUrl, setImageUrl] = useState(""), [message, setMessage] = useState("Loading machine…");
  useEffect(() => { const supabase = getSupabaseBrowserClient(); if (!supabase) return; Promise.all([
    supabase.from("machines").select("id,name,model,notes,manufacturer:companies(name),category:machine_categories(name)").eq("id", machineId).single(),
    supabase.from("part_machines").select("part:parts(id,description,manufacturer_part_number)").eq("machine_id", machineId),
    supabase.from("machine_images").select("storage_path").eq("machine_id", machineId).maybeSingle(),
  ]).then(async ([machineResult, partResult, imageResult]) => { if (machineResult.error) { setMessage(machineResult.error.message); return; } setMachine(machineResult.data as unknown as Machine); setParts((partResult.data ?? []).map((row) => row.part as unknown as Part).filter(Boolean)); if (imageResult.data?.storage_path) { const signed = await supabase.storage.from("machine-images").createSignedUrl(imageResult.data.storage_path, 3600); setImageUrl(signed.data?.signedUrl ?? ""); } }); }, [machineId]);
  return <AppShell>{(profile) => <main className="workspace"><div className="part-toolbar"><a className="back-link" href="/dashboard">← Back to search</a>{profile.role === "admin" && <a className="button secondary compact" href={`/admin/machines?edit=${machineId}`}>Edit machine</a>}</div>{!machine ? <section className="detail-state"><p>{message}</p></section> : <><section className="machine-hero"><div>{imageUrl ? <Image unoptimized src={imageUrl} width={520} height={390} alt={machine.name}/> : <span className="machine-image-empty">No image</span>}</div><div><p className="eyebrow accent">Machine</p><h1>{machine.name}</h1><dl><div><dt>Company</dt><dd>{machine.manufacturer?.name ?? "—"}</dd></div><div><dt>Model</dt><dd>{machine.model ?? "—"}</dd></div><div><dt>Category</dt><dd>{machine.category?.name ?? "—"}</dd></div></dl>{machine.notes && <p>{machine.notes}</p>}</div></section><section className="results-section"><div className="results-meta"><div><h2>Compatible parts</h2><span>{parts.length} results</span></div></div><div className="parts-table">{parts.map((part) => <a className="part-row machine-part-row" href={`/parts/${part.id}`} key={part.id}><span className="part-title"><i><BoxIcon/></i><span><strong>{part.description}</strong><small>{part.manufacturer_part_number ?? "No part number"}</small></span></span><span className="row-arrow"><ArrowIcon/></span></a>)}{!parts.length && <div className="empty-row">No compatible parts linked.</div>}</div></section></>}</main>}</AppShell>;
}
