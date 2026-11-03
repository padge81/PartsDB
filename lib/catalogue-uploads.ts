import type {SupabaseClient} from '@supabase/supabase-js';

function check(error: {message: string} | null) {
  if (error) throw new Error(error.message);
}

/** Upload before switching the unique machine image link. The old object is
 * retained until the database acknowledges the replacement. */
export async function saveMachineImage(client: SupabaseClient, machineId: string, file: File | null, remove: boolean) {
  if (!file && !remove) return;
  const bucket = client.storage.from('machine-images');
  const existing = await client.from('machine_images').select('id,storage_path').eq('machine_id', machineId).maybeSingle();
  check(existing.error);
  if (file) {
    const path = `${machineId}/${crypto.randomUUID()}.webp`;
    const uploaded = await bucket.upload(path, file, {contentType: 'image/webp'});
    check(uploaded.error);
    const linked = await client.from('machine_images').upsert({machine_id: machineId, storage_path: path}, {onConflict: 'machine_id'});
    // A lost response may mean the link committed. Never delete the new object
    // on an uncertain result; an unlinked object is safer than a broken photo.
    check(linked.error);
    if (existing.data && existing.data.storage_path !== path) {
      await bucket.remove([existing.data.storage_path]).catch(() => {});
    }
  } else if (existing.data) {
    const deleted = await client.from('machine_images').delete().eq('id', existing.data.id).eq('storage_path', existing.data.storage_path);
    check(deleted.error);
    await bucket.remove([existing.data.storage_path]).catch(() => {});
  }
}

/** One attempt owns a stable request ID and a stable object path per File.
 * Retry reconciles acknowledged writes before uploading or submitting again. */
export function createPartRequestSubmission(client: SupabaseClient, ownerId: string, id = crypto.randomUUID()) {
  const paths = new Map<File, string>();
  return {id, async submit(values: Record<string, unknown>, files: File[]) {
    const existing = await client.from('part_requests').select('id,status').eq('id', id).maybeSingle();
    check(existing.error);
    if (existing.data?.status === 'pending') return id;
    if (existing.data && existing.data.status !== 'draft') throw new Error('This request has already been reviewed. Open My requests to see its status.');
    const payload = {...values, id, requested_by: ownerId, status: 'draft'};
    const saved = existing.data
      ? await client.from('part_requests').update(payload).eq('id', id).eq('status', 'draft').select('id').single()
      : await client.from('part_requests').insert(payload).select('id').single();
    check(saved.error);
    const images = await client.from('request_images').select('id,storage_path,sort_order').eq('request_id', id);
    check(images.error);
    const desired = files.map((file, index) => {
      if (!paths.has(file)) paths.set(file, `${ownerId}/${id}/${crypto.randomUUID()}.webp`);
      return {file, path: paths.get(file)!, index};
    });
    const retained = new Set<string>();
    for (const image of images.data ?? []) {
      if (desired.some(item => item.path === image.storage_path && item.index === image.sort_order)) {
        retained.add(image.storage_path);
      } else {
        const removed = await client.from('request_images').delete().eq('id', image.id);
        check(removed.error);
        // Retain objects until after submission: a reordered photo reuses its path.
      }
    }
    for (const {file, path, index} of desired) {
      if (retained.has(path)) continue;
      const uploaded = await client.storage.from('request-images').upload(path, file, {contentType: 'image/webp'});
      // Storage has no user UPDATE policy. A duplicate here is a retry of this
      // attempt's immutable File and path, so linking it is safe without upsert.
      if (uploaded.error && !('statusCode' in uploaded.error && String(uploaded.error.statusCode) === '409') && uploaded.error.message !== 'The resource already exists') check(uploaded.error);
      const linked = await client.from('request_images').insert({request_id: id, storage_path: path, uploaded_by: ownerId, kind: 'other', sort_order: index});
      check(linked.error);
    }
    const submitted = await client.from('part_requests').update({status: 'pending', submitted_at: new Date().toISOString()}).eq('id', id).eq('status', 'draft').select('id').single();
    check(submitted.error);
    return id;
  }};
}
