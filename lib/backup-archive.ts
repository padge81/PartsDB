import {strToU8,strFromU8,zipSync,unzipSync} from 'fflate';
import {allBackupSections,backupTables,backupPath,backupMetadata,catalogueSections,fullBackup,includedSections,MAX_BACKUP_BYTES,referencedFiles,type BackupSection,type BackupSnapshot,type BackupTables,type BackupFile} from './backup-model.ts';
export type BackupManifest={format:'PartsDB portable backup';format_version:4|5;created_at:string;source:{application_revision:string;database_revision:string;supabase_url:string};sections?:BackupSection[];complete:true;tables:Record<string,number>;storage:Record<string,number>;files?:BackupFile[]};
export type ValidatedBackup={manifest:BackupManifest;tables:BackupTables;sections:BackupSection[];files:BackupFile[];entries:Record<string,Uint8Array>;size:number;canReplace:boolean};
export async function backupDigest(bytes:Uint8Array){
  const result=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
  return [...new Uint8Array(result)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function checksums(entries:Record<string,Uint8Array>){
  let text='';for(const name of Object.keys(entries).sort())text+=`${await backupDigest(entries[name])}  ${name}\n`;
  return strToU8(text);
}
export async function buildBackup(snapshot:BackupSnapshot,appRevision:string,download:(file:BackupFile)=>Promise<Uint8Array>,progress:(text:string)=>void=()=>{}){
  const created=new Date().toISOString(),entries:Record<string,Uint8Array>={},files:BackupFile[]=[];
  let bytes=new TextEncoder().encode(JSON.stringify(snapshot.tables)).byteLength;
  if(bytes>MAX_BACKUP_BYTES)throw new Error('Database records exceed the 1 GB browser backup limit.');
  for(const [index,file] of snapshot.files.entries()){
    progress(`Preparing file ${index+1} of ${snapshot.files.length}…`);
    const content=await download(file);bytes+=content.byteLength;
    if(bytes>MAX_BACKUP_BYTES)throw new Error('Selected files exceed the 1 GB browser backup limit. Select fewer sections.');
    if(file.bytes!==null&&file.bytes!==content.byteLength)throw new Error('A file changed since its size was calculated. Refresh the estimate and retry.');
    const key=backupPath(file.bucket,file.path);if(entries[key])throw new Error('Duplicate backup file.');
    entries[key]=content;files.push({...file,bytes:content.byteLength});
  }
  const metadata=backupMetadata({...snapshot,files},appRevision,created),manifest:BackupManifest=metadata.manifest;
  entries['manifest.json']=strToU8(JSON.stringify(manifest));
  entries['database.json']=strToU8(JSON.stringify(metadata.database));
  entries['report.json']=strToU8(JSON.stringify(metadata.report));
  entries['checksums.sha256']=await checksums(entries);
  if(Object.values(entries).reduce((sum,value)=>sum+value.byteLength,0)>MAX_BACKUP_BYTES)throw new Error('Backup exceeds the 1 GB browser limit. Select fewer sections.');
  const archive=zipSync(entries,{level:0});
  if(archive.byteLength>MAX_BACKUP_BYTES)throw new Error('ZIP exceeds the 1 GB browser limit. Select fewer sections.');
  return {bytes:archive,name:`partsdb-${fullBackup(snapshot.sections)?'full':'selected'}-${created.replace(/[:.]/g,'-')}.zip`,manifest};
}
export async function validateBackup(file:File):Promise<ValidatedBackup>{
  if(file.size>MAX_BACKUP_BYTES)throw new Error('Backup exceeds the 1 GB browser restore limit.');
  let expanded=0;const seen=new Set<string>();
  const entries=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>{
    if(seen.has(entry.name)||seen.size>=100000)throw new Error('Duplicate ZIP entry or too many entries.');seen.add(entry.name);
    if(entry.name.startsWith('/')||entry.name.includes('\\')||entry.name.split('/').some(p=>!p||p==='.'||p==='..')||/[\x00-\x1f\x7f]/.test(entry.name))throw new Error('Unsafe ZIP entry.');
    expanded+=entry.originalSize;if(expanded>MAX_BACKUP_BYTES)throw new Error('Expanded backup exceeds the 1 GB browser limit.');return true;
  }});
  const parse=(name:string)=>{if(!entries[name])throw new Error(`Backup is missing ${name}.`);try{return JSON.parse(strFromU8(entries[name]));}catch{throw new Error(`Invalid ${name}.`);}};
  const manifest=parse('manifest.json') as BackupManifest,database=parse('database.json');parse('report.json');
  if(manifest.format!=='PartsDB portable backup'||![4,5].includes(manifest.format_version)||manifest.complete!==true||database.format!=='PartsDB backup'||database.version!==manifest.format_version)throw new Error('Unsupported or incomplete PartsDB backup.');
  if(!database.tables||typeof database.tables!=='object'||Array.isArray(database.tables)||!manifest.tables||!manifest.storage||!manifest.source)throw new Error('Invalid backup manifest.');
  const tables=database.tables as BackupTables;
  let sections:BackupSection[];
  if(manifest.format_version===4)sections=[...catalogueSections];
  else{
    if(!Array.isArray(manifest.sections)||!manifest.sections.length||manifest.sections.some(s=>!allBackupSections.includes(s))||new Set(manifest.sections).size!==manifest.sections.length)throw new Error('Invalid backup section selection.');
    sections=includedSections(manifest.sections);
    if(sections.length!==manifest.sections.length)throw new Error('Backup is missing required linked sections.');
  }
  const expectedTables=backupTables.filter(t=>sections.includes(t.section)).map(t=>t.name);
  if(Object.keys(tables).some(name=>!expectedTables.includes(name))||Object.keys(manifest.tables).some(name=>!expectedTables.includes(name)))throw new Error('Unexpected table in backup.');
  for(const name of expectedTables){
    if(!Array.isArray(tables[name])||manifest.tables[name]!==tables[name].length||tables[name].some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error(`Missing or invalid ${name} records.`);
  }
  if(!entries['checksums.sha256'])throw new Error('Backup is missing checksums.sha256.');
  const expected=new Map<string,string>();
  for(const line of strFromU8(entries['checksums.sha256']).trim().split('\n')){
    const match=line.match(/^([a-f0-9]{64})  (.+)$/);if(!match||expected.has(match[2]))throw new Error('Invalid checksum manifest.');expected.set(match[2],match[1]);
  }
  const names=Object.keys(entries).filter(name=>name!=='checksums.sha256');
  if(names.length!==expected.size)throw new Error('Checksum coverage is incomplete.');
  for(const name of names)if(expected.get(name)!==await backupDigest(entries[name]))throw new Error(`Checksum failed for ${name}.`);
  const files=referencedFiles(tables),storage:Record<string,number>={},expectedNames=new Set(['manifest.json','database.json','report.json','checksums.sha256']);
  for(const fileRef of files){
    const name=backupPath(fileRef.bucket,fileRef.path,manifest.format_version),content=entries[name];
    if(!content)throw new Error(`Missing file: ${fileRef.bucket}/${fileRef.path}`);
    fileRef.bytes=content.byteLength;expectedNames.add(name);storage[fileRef.bucket]=(storage[fileRef.bucket]??0)+1;
  }
  if(Object.keys(entries).some(name=>!expectedNames.has(name)))throw new Error('Unexpected file in backup.');
  for(const bucket of new Set([...Object.keys(storage),...Object.keys(manifest.storage)]))if((storage[bucket]??0)!==(manifest.storage[bucket]??0))throw new Error('File counts do not match the manifest.');
  if(manifest.format_version===5){
    if(!Array.isArray(manifest.files)||manifest.files.length!==files.length)throw new Error('Invalid file inventory.');
    const inventory=new Map(manifest.files.map(f=>[backupPath(f.bucket,f.path),f.bytes]));
    if(inventory.size!==files.length||files.some(f=>inventory.get(backupPath(f.bucket,f.path))!==f.bytes))throw new Error('File sizes do not match the manifest.');
  }
  return {manifest,tables,sections,files,entries,size:file.size,canReplace:fullBackup(sections)};
}
