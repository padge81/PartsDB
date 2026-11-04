import type {SupabaseClient} from '@supabase/supabase-js';
import {backupPath,type BackupSection,type BackupSnapshot} from './backup-model.ts';
import {backupDigest,type ValidatedBackup} from './backup-archive.ts';
const failure=(error:{message:string}|null)=>{if(error)throw new Error(error.message);};
export async function loadBackupSnapshot(client:SupabaseClient,sections:BackupSection[]):Promise<BackupSnapshot>{
  const {data,error}=await client.rpc('prepare_backup_export',{selected_sections:sections});failure(error);
  if(!data?.job_id||!Array.isArray(data.files)||!data.tables)throw new Error('Backup preparation returned an invalid response.');
  return data as BackupSnapshot;
}
export async function closeBackupJob(client:SupabaseClient,id:string){
  const {error}=await client.rpc('close_backup_job',{job_id:id});failure(error);
}
export type RestorePlan={job_id:string;sections:BackupSection[];files:Array<{bucket:string;path:string;target_path:string;bytes:number}>;uploaded:Set<string>};
export async function planBackupRestore(client:SupabaseClient,backup:ValidatedBackup,mode:'merge'|'restore',confirmation:string):Promise<RestorePlan>{
  if(mode==='restore'&&!backup.canReplace)throw new Error('Partial and legacy catalogue backups support merge only.');
  const {data,error}=await client.rpc('prepare_backup_restore',{document:backup.tables,selected_sections:backup.sections,
    file_inventory:backup.files,restore_mode:mode,confirmation});failure(error);
  if(!data?.job_id||!Array.isArray(data.files))throw new Error('Restore planning returned an invalid response.');
  return {...data,uploaded:new Set<string>()};
}
export async function applyBackup(client:SupabaseClient,backup:ValidatedBackup,plan:RestorePlan,progress:(value:string)=>void){
  for(const [index,file] of plan.files.entries()){
    const key=backupPath(file.bucket,file.path,backup.manifest.format_version),bytes=backup.entries[key];
    if(!bytes||bytes.byteLength!==file.bytes)throw new Error('Restore file does not match its validated inventory.');
    if(plan.uploaded.has(key))continue;
    progress(`Transferring file ${index+1} of ${plan.files.length}…`);
    const type=file.bucket==='reference-documents'?'application/pdf':file.target_path.endsWith('.png')?'image/png':/\.jpe?g$/.test(file.target_path)?'image/jpeg':'image/webp';
    const bucket=client.storage.from(file.bucket);
    const {error}=await bucket.upload(file.target_path,new Blob([new Uint8Array(bytes)],{type}),{contentType:type});
    if(error){
      // An uncertain upload may have committed. Verify its exact bytes before
      // treating an existing staged object as a successful retry.
      const existing=await bucket.download(file.target_path);
      if(existing.error||!existing.data||await backupDigest(new Uint8Array(await existing.data.arrayBuffer()))!==await backupDigest(bytes))failure(error);
    }
    plan.uploaded.add(key);
  }
  progress('Applying records in one transaction…');
  const {data,error}=await client.rpc('apply_backup_restore',{job_id:plan.job_id});failure(error);
  if(!data||typeof data.records!=='number'||data.cancelled)throw new Error('Restore did not return a completion result.');
  return data as {records:number;files:number;sections:BackupSection[];mode:string};
}
export async function cancelBackupRestore(client:SupabaseClient,plan:RestorePlan){
  // The server locks the job before approving cleanup. A committed restore
  // returns no paths, so a lost success response can never delete live files.
  const {data,error}=await client.rpc('cancel_backup_restore',{job_id:plan.job_id});failure(error);
  if(!data||!Array.isArray(data.files))throw new Error('Could not verify which staged files are safe to remove.');
  const files=data.files as RestorePlan['files'];
  for(const bucket of new Set(files.map(f=>f.bucket))){
    const paths=files.filter(f=>f.bucket===bucket).map(f=>f.target_path);
    for(let index=0;index<paths.length;index+=100){const removed=await client.storage.from(bucket).remove(paths.slice(index,index+100));failure(removed.error);}
  }
  await closeBackupJob(client,plan.job_id);
  return {committed:!!data.committed};
}
