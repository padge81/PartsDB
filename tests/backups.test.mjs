import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {backupSections,allBackupSections,backupTables,includedSections,estimateBackup,backupPath,MAX_BACKUP_BYTES} from '../lib/backup-model.ts';
import {buildBackup,validateBackup,backupDigest} from '../lib/backup-archive.ts';
import {applyBackup,cancelBackupRestore} from '../lib/backup-client.ts';

const snapshot=(sections=['bench'])=>({job_id:'job',sections,tables:Object.fromEntries(backupTables.filter(t=>sections.includes(t.section)).map(t=>[t.name,[]])),files:[],database_revision:'0.15.0'});
const file=bytes=>new File([bytes],'backup.zip',{type:'application/zip'});
async function repack(entries){
 let sums='';for(const name of Object.keys(entries).filter(n=>n!=='checksums.sha256').sort())sums+=`${await backupDigest(entries[name])}  ${name}\n`;
 entries['checksums.sha256']=strToU8(sums);return zipSync(entries,{level:0});
}
test('section dependencies include linked data and do not include unrelated sections',()=>{
 assert.deepEqual(includedSections(['repairs']),['reference','machines','parts','repairs']);
 assert.deepEqual(includedSections(['bench']),['bench']);
 assert.deepEqual(includedSections(['requests']),['reference','machines','parts','requests']);
 assert.throws(()=>includedSections(['system_metadata']),/Unknown/);
 assert.equal(backupSections.length,6);
});
test('size preview uses metadata without downloading files, and reports unknown sizes',()=>{
 const s=snapshot();s.files=[{bucket:'reference-documents',path:'owner/ref/a.pdf',bytes:123456},{bucket:'reference-images',path:'owner/ref/b.webp',bytes:null}];
 const estimate=estimateBackup(s);
 assert.equal(estimate.files,2);assert.equal(estimate.knownFileBytes,123456);assert.equal(estimate.unknownFiles,1);assert.ok(estimate.estimatedBytes>123456);
});
test('partial backup round trips documents and identifies merge-only scope',async()=>{
 const s=snapshot();s.tables.bench_references=[{id:'ref',owner_id:'owner',photos:[],documents:[{id:'doc',name:'Datasheet',path:'owner/ref/a.pdf',bytes:7}]}];
 s.files=[{bucket:'reference-documents',path:'owner/ref/a.pdf',bytes:7}];let downloads=0;
 const result=await buildBackup(s,'0.31.0',async()=>{downloads++;return strToU8('pdfdata');});
 assert.ok(Math.abs(estimateBackup(s,'0.31.0').estimatedBytes-result.bytes.byteLength)<1024);
 assert.equal(downloads,1);const restored=await validateBackup(file(result.bytes));
 assert.deepEqual(restored.sections,['bench']);assert.equal(restored.canReplace,false);assert.equal(restored.size,result.bytes.byteLength);
 assert.equal(strFromU8(restored.entries['files/reference-documents/owner/ref/a.pdf']),'pdfdata');
});
test('full backup preserves all tables and more than 1000 records',async()=>{
 const s=snapshot(allBackupSections);s.tables.companies=Array.from({length:1205},(_,i)=>({id:String(i),name:'Company '+i}));
 const result=await buildBackup(s,'0.31.0',async()=>{throw Error('No files expected');});
 const restored=await validateBackup(file(result.bytes));assert.equal(restored.tables.companies.length,1205);assert.equal(restored.canReplace,true);
});
test('legacy v4 catalogue ZIP remains importable without pretending to include Workshop',async()=>{
 const sections=['reference','machines','parts','requests'],s=snapshot(sections);
 const tables=s.tables,entries={};
 entries['database.json']=strToU8(JSON.stringify({format:'PartsDB backup',version:4,tables}));
 entries['manifest.json']=strToU8(JSON.stringify({format:'PartsDB portable backup',format_version:4,created_at:'2026-01-01',complete:true,source:{application_revision:'0.30.0',database_revision:'0.14.0',supabase_url:'source'},tables:Object.fromEntries(Object.keys(tables).map(k=>[k,0])),storage:{}}));
 entries['report.json']=strToU8('{}');
 const restored=await validateBackup(file(await repack(entries)));assert.deepEqual(restored.sections,sections);assert.equal(restored.canReplace,false);
});
test('changed file sizes fail preparation rather than creating a misleading backup',async()=>{
 const s=snapshot();s.files=[{bucket:'reference-documents',path:'owner/ref/a.pdf',bytes:10}];
 await assert.rejects(buildBackup(s,'0.31.0',async()=>strToU8('short')),/changed/);
});
test('unmeasured file sizes become exact in the prepared manifest',async()=>{
 const s=snapshot();s.tables.bench_references=[{id:'ref',owner_id:'owner',photos:[{path:'owner/ref/a.webp'}],documents:[]}];s.files=[{bucket:'reference-images',path:'owner/ref/a.webp',bytes:null}];
 const result=await buildBackup(s,'0.31.0',async()=>strToU8('image'));const restored=await validateBackup(file(result.bytes));assert.equal(restored.manifest.files[0].bytes,5);
});
test('missing tables, unexpected files and tampered checksums cannot reach restore',async()=>{
 const built=await buildBackup(snapshot(),'0.31.0',async()=>{throw Error('No files');});
 const entries=unzipSync(built.bytes);entries['database.json']=strToU8('tampered');await assert.rejects(validateBackup(file(zipSync(entries))),/Invalid|Checksum/);
 const missing=unzipSync(built.bytes);const db=JSON.parse(strFromU8(missing['database.json']));delete db.tables.bench_references;missing['database.json']=strToU8(JSON.stringify(db));await assert.rejects(validateBackup(file(await repack(missing))),/Missing or invalid/);
 const extra=unzipSync(built.bytes);extra['secrets.txt']=strToU8('unexpected');await assert.rejects(validateBackup(file(await repack(extra))),/Unexpected file/);
});
test('missing media and falsified inventory are rejected even with fresh checksums',async()=>{
 const s=snapshot();s.tables.bench_references=[{id:'ref',owner_id:'owner',photos:[],documents:[{path:'owner/ref/a.pdf'}]}];s.files=[{bucket:'reference-documents',path:'owner/ref/a.pdf',bytes:3}];
 const built=await buildBackup(s,'0.31.0',async()=>strToU8('pdf'));
 const missing=unzipSync(built.bytes);delete missing['files/reference-documents/owner/ref/a.pdf'];await assert.rejects(validateBackup(file(await repack(missing))),/Missing file/);
 const wrong=unzipSync(built.bytes);const manifest=JSON.parse(strFromU8(wrong['manifest.json']));manifest.files[0].bytes=99;wrong['manifest.json']=strToU8(JSON.stringify(manifest));await assert.rejects(validateBackup(file(await repack(wrong))),/File sizes/);
});
test('unsupported sections, missing dependencies, oversized archives and unsafe paths fail validation',async()=>{
 const built=await buildBackup(snapshot(),'0.31.0',async()=>{throw Error('No files');});
 const bad=unzipSync(built.bytes);const manifest=JSON.parse(strFromU8(bad['manifest.json']));manifest.sections=['repairs'];bad['manifest.json']=strToU8(JSON.stringify(manifest));await assert.rejects(validateBackup(file(await repack(bad))),/linked sections/);
 await assert.rejects(validateBackup({size:MAX_BACKUP_BYTES+1}),/1 GB/);
 assert.throws(()=>backupPath('reference-documents','../../private.pdf'),/Unsafe/);
 assert.throws(()=>backupPath('unapproved','file'),/Unsafe/);
 const traversal=unzipSync(built.bytes);traversal['../bad']=strToU8('bad');await assert.rejects(validateBackup(file(await repack(traversal))),/Unsafe ZIP/);
});
test('upload retry verifies uncertain staged bytes before applying records',async()=>{
 const bytes=strToU8('pdf'),backup={manifest:{format_version:5},entries:{'files/reference-documents/source.pdf':bytes}};
 const plan={job_id:'job',files:[{bucket:'reference-documents',path:'source.pdf',target_path:'target.pdf',bytes:3}],uploaded:new Set()};let applied=0;
 const client={storage:{from:()=>({upload:async()=>({error:{message:'Lost acknowledgement'}}),download:async()=>({data:new Blob([bytes]),error:null})})},rpc:async name=>{assert.equal(name,'apply_backup_restore');applied++;return {data:{records:1,files:1},error:null};}};
 await applyBackup(client,backup,plan,()=>{});assert.equal(applied,1);assert.equal(plan.uploaded.size,1);
});
test('an upload failure stops before records are changed',async()=>{
 const backup={manifest:{format_version:5},entries:{'files/reference-documents/source.pdf':strToU8('pdf')}};
 const plan={job_id:'job',files:[{bucket:'reference-documents',path:'source.pdf',target_path:'target.pdf',bytes:3}],uploaded:new Set()};let applied=false;
 const client={storage:{from:()=>({upload:async()=>({error:{message:'Upload failed'}}),download:async()=>({data:null,error:{message:'Not found'}})})},rpc:async()=>{applied=true;}};
 await assert.rejects(applyBackup(client,backup,plan,()=>{}),/Upload failed/);assert.equal(applied,false);
});
test('cancelling after an uncertain committed restore never deletes live files',async()=>{
 let deleted=false;const calls=[];
 const client={storage:{from:()=>({remove:async()=>{deleted=true;}})},rpc:async name=>{calls.push(name);return {data:{files:[],committed:true},error:null};}};
 const result=await cancelBackupRestore(client,{job_id:'job'});assert.equal(result.committed,true);assert.equal(deleted,false);assert.deepEqual(calls,['cancel_backup_restore','close_backup_job']);
});
