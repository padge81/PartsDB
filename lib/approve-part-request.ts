import type { SupabaseClient } from "@supabase/supabase-js";

export type ApprovalSupplier = { supplier_id?: string; supplier_name?: string; supplier_part_number?: string; ordering_information?: string; notes?: string; preference_rank?: number };
export type ApprovalRequest = {
  id: string; status: string; part_description: string; part_manufacturer?: string | null; manufacturer_part_number?: string | null;
  machine_manufacturer?: string | null; machine_name?: string | null; machine_model?: string | null; machine_ids?: string[] | null;
  supply_type: string; category_ids?: string[] | null; commonly_ordered_part_ids?: string[] | null;
  supplier_information?: ApprovalSupplier[] | null; notes?: string | null; review_notes?: string | null;
};
type RequestImage = { storage_path: string; kind: string | null; sort_order: number };
type SimilarPart = { score: number };

export class ApprovalSkipError extends Error {}

function fail(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function findMachineId(supabase: SupabaseClient, manufacturerName?: string | null, machineName?: string | null) {
  if (!manufacturerName || !machineName) return null;
  const company = await supabase.from("companies").select("id").ilike("name", manufacturerName).limit(1).maybeSingle();
  fail(company.error, "Could not check the machine manufacturer");
  if (!company.data) return null;
  const machine = await supabase.from("machines").select("id").eq("manufacturer_id", company.data.id).ilike("name", machineName).limit(1).maybeSingle();
  fail(machine.error, "Could not check the machine");
  return machine.data?.id ?? null;
}

async function ensureCompany(supabase: SupabaseClient, name: string, role: "manufacturer" | "supplier") {
  const existing = await supabase.from("companies").select("id").ilike("name", name).limit(1).maybeSingle();
  fail(existing.error, `Could not find ${name}`);
  let id = existing.data?.id as string | undefined;
  if (!id) {
    const created = await supabase.from("companies").insert({ name }).select("id").single();
    fail(created.error, `Could not create ${name}`); id = created.data.id;
  }
  const roleResult = await supabase.from("company_roles").upsert({ company_id: id, role }, { onConflict: "company_id,role" });
  fail(roleResult.error, `Could not assign the ${role} role to ${name}`);
  return id;
}

export async function approvePartRequest(supabase: SupabaseClient, request: ApprovalRequest, profileId: string, allowDuplicateOverride = false) {
  if (request.status !== "pending") throw new ApprovalSkipError("Request is no longer pending.");
  if (!request.part_description?.trim()) throw new ApprovalSkipError("Part description is required.");
  if (!request.supply_type) throw new ApprovalSkipError("Supply type is required.");

  const mainMachineId = await findMachineId(supabase, request.machine_manufacturer, request.machine_name);
  const machineIds = [...new Set([mainMachineId, ...(request.machine_ids ?? [])].filter(Boolean))] as string[];
  const duplicates = await supabase.rpc("find_similar_parts", {
    candidate_number: request.manufacturer_part_number || "", candidate_description: request.part_description,
    candidate_machine_ids: machineIds, result_limit: 8,
  });
  fail(duplicates.error, "Could not run the duplicate check");
  if (!allowDuplicateOverride && ((duplicates.data ?? []) as SimilarPart[]).some((part) => part.score >= .78)) {
    throw new ApprovalSkipError("Possible duplicate requires individual review.");
  }

  let manufacturerId: string | null = null;
  if (request.part_manufacturer) manufacturerId = await ensureCompany(supabase, request.part_manufacturer, "manufacturer");
  const createdPart = await supabase.from("parts").insert({ description: request.part_description, manufacturer_id: manufacturerId, manufacturer_part_number: request.manufacturer_part_number || null, notes: request.notes || null, supply_type: request.supply_type, status: "active", created_by: profileId, updated_by: profileId }).select("id").single();
  fail(createdPart.error, "Could not create the part");
  const partId = createdPart.data.id as string;

  if (request.category_ids?.length) {
    const result = await supabase.from("part_categories").insert(request.category_ids.map((category_id) => ({ part_id: partId, category_id, created_by: profileId })));
    fail(result.error, "Part created, but categories could not be linked");
  }
  for (const supplier of request.supplier_information ?? []) {
    let supplierId = supplier.supplier_id;
    if (!supplierId && supplier.supplier_name) supplierId = await ensureCompany(supabase, supplier.supplier_name, "supplier");
    if (!supplierId) continue;
    const role = await supabase.from("company_roles").upsert({ company_id: supplierId, role: "supplier" }, { onConflict: "company_id,role" });
    fail(role.error, "Part created, but a supplier role could not be assigned");
    const link = await supabase.from("part_suppliers").insert({ part_id: partId, supplier_id: supplierId, preference_rank: supplier.preference_rank ?? 1, supplier_part_number: supplier.supplier_part_number || null, ordering_information: supplier.ordering_information || null, notes: supplier.notes || null });
    fail(link.error, "Part created, but a supplier could not be linked");
  }
  const group = await supabase.rpc("set_part_order_group", { p_part_id: partId, p_related_part_ids: request.commonly_ordered_part_ids ?? [], p_expand_existing_groups: true });
  fail(group.error, "Part created, but its ordering group could not be linked");

  const images = await supabase.from("request_images").select("storage_path,kind,sort_order").eq("request_id", request.id).order("sort_order");
  fail(images.error, "Part created, but request images could not be loaded");
  for (const [index, image] of ((images.data ?? []) as RequestImage[]).entries()) {
    const downloaded = await supabase.storage.from("request-images").download(image.storage_path);
    if (downloaded.error || !downloaded.data) throw new Error(`Part created, but image ${index + 1} could not be copied: ${downloaded.error?.message ?? "download failed"}`);
    const targetPath = `${partId}/${crypto.randomUUID()}.webp`;
    const uploaded = await supabase.storage.from("part-images").upload(targetPath, downloaded.data, { contentType: downloaded.data.type || "image/webp" });
    fail(uploaded.error, `Part created, but image ${index + 1} could not be stored`);
    const imageRow = await supabase.from("part_images").insert({ part_id: partId, storage_path: targetPath, uploaded_by: profileId, kind: image.kind || "other", sort_order: index });
    fail(imageRow.error, `Part created, but image ${index + 1} could not be linked`);
  }

  if (request.machine_ids?.length) {
    const links = await supabase.from("part_machines").upsert(request.machine_ids.map((machine_id) => ({ part_id: partId, machine_id })), { onConflict: "part_id,machine_id" });
    fail(links.error, "Part created, but additional machines could not be linked");
  }
  if (request.machine_manufacturer && request.machine_name) {
    const machineManufacturerId = await ensureCompany(supabase, request.machine_manufacturer, "manufacturer");
    let resolvedMachineId = mainMachineId;
    if (!resolvedMachineId) {
      const created = await supabase.from("machines").insert({ manufacturer_id: machineManufacturerId, name: request.machine_name, model: request.machine_model || null }).select("id").single();
      fail(created.error, "Part created, but the machine could not be created"); resolvedMachineId = created.data.id;
    }
    const link = await supabase.from("part_machines").upsert({ part_id: partId, machine_id: resolvedMachineId }, { onConflict: "part_id,machine_id" });
    fail(link.error, "Part created, but the machine could not be linked");
  }
  const finished = await supabase.from("part_requests").update({ status: "approved", approved_part_id: partId, reviewed_by: profileId, reviewed_at: new Date().toISOString(), review_notes: request.review_notes || null }).eq("id", request.id).eq("status", "pending");
  fail(finished.error, "Part created, but the request could not be marked approved");
  return partId;
}
