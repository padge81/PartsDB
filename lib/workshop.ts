import { getSupabaseBrowserClient } from './supabase';

export type Mark = { kind: 'circle' | 'arrow' | 'number'; x: number; y: number; x2: number; y2: number; label?: string };
export type RepairStep = { id: string; title: string; instruction: string; image_path: string; annotations: Mark[]; imageUrl?: string };
export type RepairPart = { part_id: string; description: string; number: string; quantity: number };
export type RepairLog = { id: string; title: string; machine_id: string | null; machine_name: string; technician: string; job_date: string; fault: string; outcome: string; tests: string; tools: string; status: 'draft' | 'in_progress' | 'completed'; revision: number; updated_at: string; steps: RepairStep[]; parts: RepairPart[] };
export type Choice = { id: string; name: string; number?: string };
export const newLog = (): RepairLog => ({ id: crypto.randomUUID(), title: 'Untitled repair', machine_id: null, machine_name: '', technician: '', job_date: new Date().toLocaleDateString('en-CA'), fault: '', outcome: '', tests: '', tools: '', status: 'draft', revision: 0, updated_at: new Date().toISOString(), steps: [], parts: [] });
export function checkLog(log: RepairLog) {
  if (!log.title.trim()) throw new Error('Give this repair a title.');
  if (log.status === 'completed' && (!log.outcome.trim() || !log.tests.trim())) throw new Error('Record the outcome and final test before marking this job completed.');
  if (log.parts.some(p => !Number.isFinite(p.quantity) || p.quantity <= 0)) throw new Error('Part quantities must be greater than zero.');
}
export function prompts(log: RepairLog) {
  return [!log.fault.trim() && 'What fault or task prompted this job?', !log.machine_name && 'Which machine did you work on?', !log.parts.length && 'Were any parts replaced? Link them if they are in the catalogue.', log.steps.some(s => !s.instruction.trim()) && 'What should a technician do in each photo step?', !log.tests.trim() && 'How did you test the repair?', !log.outcome.trim() && 'What was the final result?'].filter(Boolean) as string[];
}
export function demoLog(): RepairLog {
  return { ...newLog(), id: 'preview-sample', title: 'Prize meter signal check', machine_name: 'Example claw machine', technician: 'Demo technician', fault: 'Prize accounting does not match the number of prizes won.', tools: 'Multimeter, service manual', status: 'in_progress', steps: [{ id: 'sample-step', title: 'Record the meter connection', instruction: 'Add a photo of the meter wiring. Circle the connection you are describing and record the observed pulse count. This is a demonstration record, not a verified repair instruction.', image_path: '', annotations: [] }], tests: '', outcome: '' };
}

function previewDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const r = indexedDB.open('partsdb-workshop-preview-v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('logs', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Device storage is unavailable. Export your work before closing.')); });
}
export async function loadPreview(): Promise<RepairLog[]> {
  const db = await previewDB();
  return new Promise((resolve, reject) => { const tx = db.transaction('logs', 'readonly'); const r = tx.objectStore('logs').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); tx.oncomplete = () => db.close(); });
}
export async function savePreview(log: RepairLog): Promise<RepairLog> {
  checkLog(log); const db = await previewDB(); const saved = { ...log, revision: log.revision + 1, updated_at: new Date().toISOString() };
  return new Promise((resolve, reject) => { const tx = db.transaction('logs', 'readwrite'); const store = tx.objectStore('logs'); const request = store.get(log.id); request.onsuccess = () => { if (request.result && request.result.revision !== log.revision) { tx.abort(); return; } store.put(saved); }; tx.oncomplete = () => { db.close(); resolve(saved); }; tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Save failed or another tab changed this log. Export your changes, then reload.')); }; });
}
export async function loadLive() {
  const db = getSupabaseBrowserClient(); if (!db) throw new Error('Database is not configured.');
  const [logs, machines, parts] = await Promise.all([
    db.from('repair_logs').select('*,repair_log_parts(part_id,quantity,part:parts(description,manufacturer_part_number))').order('updated_at', { ascending: false }),
    db.from('machines').select('id,name').eq('is_active', true).order('name').limit(1000),
    db.from('parts').select('id,description,manufacturer_part_number').eq('status', 'active').order('description').limit(1000),
  ]);
  if (logs.error) throw new Error('Workshop storage is not ready: ' + logs.error.message);
  if (machines.error || parts.error) throw new Error('The parts or machine catalogue could not be loaded.');
  const records: RepairLog[] = [];
  for (const row of logs.data ?? []) {
    const steps: RepairStep[] = [];
    for (const step of row.steps ?? []) {
      let imageUrl = '';
      if (step.image_path) { const signed = await db.storage.from('repair-images').createSignedUrl(step.image_path, 3600); if (signed.error) throw new Error('A repair photo could not be loaded. Please retry.'); imageUrl = signed.data.signedUrl; }
      steps.push({ ...step, imageUrl });
    }
    records.push({ ...row, steps, parts: (row.repair_log_parts ?? []).map((p: { part_id: string; quantity: number; part: { description: string; manufacturer_part_number: string } }) => ({ part_id: p.part_id, quantity: p.quantity, description: p.part?.description ?? 'Unavailable part', number: p.part?.manufacturer_part_number ?? '' })) });
  }
  return { records, machines: (machines.data ?? []) as Choice[], parts: (parts.data ?? []).map(p => ({ id: p.id, name: p.description, number: p.manufacturer_part_number ?? '' })) };
}
export async function saveLive(log: RepairLog) {
  checkLog(log); const db = getSupabaseBrowserClient(); if (!db) throw new Error('Database is not configured.');
  const document = { ...log, steps: log.steps.map(step => ({ id: step.id, title: step.title, instruction: step.instruction, image_path: step.image_path, annotations: step.annotations })) };
  const { data, error } = await db.rpc('save_repair_log', { document, expected_revision: log.revision });
  if (error) throw new Error(error.message);
  return { ...log, revision: data.revision as number, updated_at: data.updated_at as string };
}
export async function imageDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Photo could not be read.')); reader.readAsDataURL(file); });
}
export async function uploadRepairPhoto(logId: string, file: File) {
  const db = getSupabaseBrowserClient(); if (!db) throw new Error('Database is not configured.');
  const { data: user, error } = await db.auth.getUser(); if (error || !user.user) throw new Error('Sign in again before saving a photo.');
  const path = `${user.user.id}/${logId}/${crypto.randomUUID()}.webp`;
  const result = await db.storage.from('repair-images').upload(path, file, { contentType: 'image/webp', upsert: false });
  if (result.error) throw new Error(result.error.message);
  return path;
}
