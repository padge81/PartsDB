export type BackupSection = 'reference' | 'machines' | 'parts' | 'requests' | 'repairs' | 'bench';
export type BackupRow = Record<string, unknown>;
export type BackupTables = Record<string, BackupRow[]>;
export const backupSections: ReadonlyArray<{id: BackupSection; label: string; depends: BackupSection[]}> = [
  {id:'reference',label:'Companies, suppliers and reference data',depends:[]},
  {id:'machines',label:'Machines',depends:['reference']},
  {id:'parts',label:'Parts catalogue',depends:['machines']},
  {id:'requests',label:'Part requests',depends:['parts']},
  {id:'repairs',label:'Workshop repair logs',depends:['parts']},
  {id:'bench',label:'Bench references and datasheets',depends:[]},
];
export const allBackupSections = backupSections.map(s=>s.id);
export const catalogueSections: BackupSection[] = ['reference','machines','parts','requests'];
export const backupTables: ReadonlyArray<{name:string; section:BackupSection; key:string[]}> = [
  {name:'supply_types',section:'reference',key:['id']},
  {name:'companies',section:'reference',key:['id']},
  {name:'company_roles',section:'reference',key:['company_id','role']},
  {name:'machine_categories',section:'reference',key:['id']},
  {name:'machines',section:'machines',key:['id']},
  {name:'categories',section:'reference',key:['id']},
  {name:'parts',section:'parts',key:['id']},
  {name:'part_requests',section:'requests',key:['id']},
  {name:'part_suppliers',section:'parts',key:['id']},
  {name:'part_machines',section:'parts',key:['part_id','machine_id']},
  {name:'part_categories',section:'parts',key:['part_id','category_id']},
  {name:'part_order_groups',section:'parts',key:['id']},
  {name:'part_order_group_members',section:'parts',key:['group_id','part_id']},
  {name:'machine_images',section:'machines',key:['id']},
  {name:'part_images',section:'parts',key:['id']},
  {name:'request_images',section:'requests',key:['id']},
  {name:'repair_logs',section:'repairs',key:['id']},
  {name:'repair_log_parts',section:'repairs',key:['repair_log_id','part_id']},
  {name:'bench_references',section:'bench',key:['id']},
];
export const MAX_BACKUP_BYTES = 1024 * 1024 * 1024;
export type BackupFile = {bucket:string; path:string; bytes:number|null; record_id?:string; owner_id?:string};
export type BackupSnapshot = {job_id:string; sections:BackupSection[]; tables:BackupTables; files:BackupFile[]; database_revision:string};

export function includedSections(requested: readonly BackupSection[]): BackupSection[] {
  if(requested.some(id=>!allBackupSections.includes(id))) throw new Error('Unknown backup section.');
  const selected=new Set(requested);
  for(let changed=true;changed;){
    changed=false;
    for(const section of backupSections) if(selected.has(section.id)) for(const dependency of section.depends) {
      if(!selected.has(dependency)){selected.add(dependency);changed=true;}
    }
  }
  return allBackupSections.filter(id=>selected.has(id));
}
export function fullBackup(sections: readonly BackupSection[]){return allBackupSections.every(id=>sections.includes(id));}
export function backupPath(bucket:string, path:string, version=5){
  if(!['machine-images','part-images','request-images','repair-images','reference-images','reference-documents'].includes(bucket)
    || !path || path.includes('\\') || path.split('/').some(part=>!part||part==='.'||part==='..') || /[\x00-\x1f\x7f]/.test(path)) throw new Error('Unsafe backup file path.');
  return `${version===4?'images':'files'}/${bucket}/${path}`;
}
export function referencedFiles(tables:BackupTables):BackupFile[]{
  const files=new Map<string,BackupFile>();
  const add=(bucket:string,path:unknown,record_id?:unknown,owner_id?:unknown)=>{
    if(typeof path!=='string'||!path) return;
    const key=backupPath(bucket,path);
    if(!files.has(key)) files.set(key,{bucket,path,bytes:null,record_id:typeof record_id==='string'?record_id:undefined,owner_id:typeof owner_id==='string'?owner_id:undefined});
  };
  for(const [table,bucket] of [['machine_images','machine-images'],['part_images','part-images'],['request_images','request-images']]){
    for(const row of tables[table]??[]){
      if(row.storage_bucket!==bucket||typeof row.storage_path!=='string'||!row.storage_path)throw new Error(`Invalid stored file in ${table}.`);
      add(bucket,row.storage_path);
    }
  }
  for(const row of tables.repair_logs??[]){
    if(!Array.isArray(row.steps))throw new Error('Invalid repair steps.');
    for(const step of row.steps) add('repair-images',step.image_path,row.id,row.owner_id);
    if(row.update_baseline!=null){
      if(typeof row.update_baseline!=='object'||!('steps' in row.update_baseline)||!Array.isArray(row.update_baseline.steps))throw new Error('Invalid repair update baseline.');
      for(const step of row.update_baseline.steps)add('repair-images',step.image_path,row.id,row.owner_id);
    }
  }
  for(const row of tables.bench_references??[]){
    if(!Array.isArray(row.photos)||!Array.isArray(row.documents))throw new Error('Invalid bench reference files.');
    for(const photo of row.photos)add('reference-images',photo.path,row.id,row.owner_id);
    for(const document of row.documents)add('reference-documents',document.path,row.id,row.owner_id);
  }
  return [...files.values()];
}
export function backupMetadata(snapshot:BackupSnapshot,appRevision:string,createdAt:string){
  const storage:Record<string,number>={};
  for(const file of snapshot.files)storage[file.bucket]=(storage[file.bucket]??0)+1;
  return {
    manifest:{format:'PartsDB portable backup' as const,format_version:5 as const,created_at:createdAt,
      source:{application_revision:appRevision,database_revision:snapshot.database_revision,supabase_url:'configured project'},
      sections:snapshot.sections,complete:true as const,tables:Object.fromEntries(Object.entries(snapshot.tables).map(([key,rows])=>[key,rows.length])),storage,files:snapshot.files},
    database:{format:'PartsDB backup',version:5,exported_at:createdAt,tables:snapshot.tables},
    report:{status:'complete',scope:fullBackup(snapshot.sections)?'all sections':'selected sections',sections:snapshot.sections,files:snapshot.files.length},
  };
}
export function estimateBackup(snapshot:BackupSnapshot,appRevision='unknown'){
  const databaseBytes=new TextEncoder().encode(JSON.stringify(snapshot.tables)).byteLength;
  const unknownFiles=snapshot.files.filter(f=>f.bytes===null).length;
  const knownFileBytes=snapshot.files.reduce((sum,f)=>sum+(f.bytes??0),0);
  const metadata=backupMetadata(snapshot,appRevision,'2000-01-01T00:00:00.000Z');
  const metadataBytes=Object.values(metadata).reduce((sum,value)=>sum+new TextEncoder().encode(JSON.stringify(value)).length,0);
  const names=['manifest.json','database.json','report.json',...snapshot.files.map(f=>backupPath(f.bucket,f.path))];
  const checksumBytes=names.reduce((sum,name)=>sum+67+new TextEncoder().encode(name).length,0);
  // Stored ZIP entries add headers and filenames. A small allowance covers
  // Unicode extras and metadata whose missing file sizes become known later.
  const overhead=278+[...names,'checksums.sha256'].reduce((sum,name)=>sum+108+new TextEncoder().encode(name).length*2,0);
  return {records:Object.values(snapshot.tables).reduce((sum,rows)=>sum+rows.length,0),files:snapshot.files.length,unknownFiles,knownFileBytes,databaseBytes,estimatedBytes:metadataBytes+knownFileBytes+checksumBytes+overhead};
}
export function formatBackupBytes(bytes:number){
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  if(bytes<1024*1024*1024)return `${(bytes/1024/1024).toFixed(1)} MB`;
  return `${(bytes/1024/1024/1024).toFixed(2)} GB`;
}
