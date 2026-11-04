import test from 'node:test';
import assert from 'node:assert/strict';
import {repairUpdateChanges,cleanRepairSteps} from '../lib/repair-updates.ts';
import {backupTables,referencedFiles,includedSections} from '../lib/backup-model.ts';
import {buildBackup,validateBackup} from '../lib/backup-archive.ts';

const step=(id,patch={})=>({id,title:'Step '+id,instruction:'Instructions',image_path:'',annotations:[],...patch});
const base=()=>({title:'Repair',machine_id:'machine',machine_name:'Machine',technician:'Technician',job_date:'2026-11-04',fault:'Fault',tools:'Tools',tests:'Tests',outcome:'Outcome',status:'completed',steps:[step('one'),step('two')],parts:[{part_id:'part',description:'Part',number:'P1',quantity:1}]});
test('summary, signed URLs, and part display-name/order changes do not create false update content',()=>{
 const before=base(),after=structuredClone(before);after.change_summary='Summary';after.steps[0].imageUrl='temporary URL';after.parts[0].description='Renamed in catalogue';
 assert.equal(repairUpdateChanges(before,after).hasChanges,false);
});
test('review identifies every changed metadata field and part quantity',()=>{
 const before=base(),after={...base(),title:'Changed',fault:'New fault',machine_id:'other',parts:[{...base().parts[0],quantity:2}]};
 const changes=repairUpdateChanges(before,after);
 assert.deepEqual(changes.fields.map(f=>f.key),['title','machine_id','fault']);assert.equal(changes.parts.length,1);assert.equal(changes.parts[0].before.quantity,1);assert.equal(changes.parts[0].after.quantity,2);
});
test('stable step IDs expose added, removed, reordered, text, photo and marking changes',()=>{
 const before=base(),after=base();before.steps.push(step('removed'));
 after.steps=[step('two',{instruction:'Changed instruction',image_path:'new.webp',annotations:[{kind:'circle',x:.1,y:.1,x2:.5,y2:.5}]}),step('one'),step('added')];
 const changes=repairUpdateChanges(before,after),two=changes.steps.find(s=>s.id==='two');
 assert.equal(two.moved,true);assert.equal(two.beforeIndex,1);assert.equal(two.afterIndex,0);assert.ok(two.textChanged&&two.photoChanged&&two.marksChanged);
 assert.equal(changes.steps.find(s=>s.id==='removed').removed,true);assert.equal(changes.steps.find(s=>s.id==='added').added,true);
});
test('annotation object key order does not create a false difference',()=>{
 const before=base(),after=base();before.steps[0].annotations=[{kind:'number',x:.1,y:.2,x2:.3,y2:.4,label:'1'}];after.steps[0].annotations=[{label:'1',y2:.4,x2:.3,y:.2,x:.1,kind:'number'}];
 assert.equal(repairUpdateChanges(before,after).hasChanges,false);
});
test('saved photo data removes transient signed URLs from draft and comparison snapshots',()=>{
 const before=base();before.steps[0].imageUrl='signed secret';const cleaned={...before,steps:cleanRepairSteps(before.steps)};
 assert.equal(cleaned.steps[0].imageUrl,undefined);assert.equal(before.steps[0].imageUrl,'signed secret');assert.equal(cleanRepairSteps(before.steps)[0].imageUrl,undefined);
});
test('repair backups retain baseline-only photos and transfer shared paths once',async()=>{
 const sections=includedSections(['repairs']),tables=Object.fromEntries(backupTables.filter(t=>sections.includes(t.section)).map(t=>[t.name,[]]));
 const baseline=base();baseline.steps=[step('one',{image_path:'owner/original/old.webp'})];
 tables.repair_logs=[{id:'original',owner_id:'owner',steps:[step('one',{image_path:'owner/original/old.webp'})]},{id:'proposal',owner_id:'author',update_of:'original',update_base_revision:4,change_summary:'New photo',update_baseline:baseline,steps:[step('one',{image_path:'author/proposal/new.webp'})]}];
 const files=referencedFiles(tables).map(f=>({...f,bytes:3}));assert.equal(files.length,2);
 const result=await buildBackup({job_id:'job',sections,tables,files,database_revision:'0.16.0'},'0.32.0',async()=>new Uint8Array([1,2,3]));
 const restored=await validateBackup(new File([result.bytes],'backup.zip'));
 assert.equal(restored.tables.repair_logs[1].update_baseline.steps[0].image_path,'owner/original/old.webp');assert.equal(restored.files.length,2);
 tables.repair_logs[1].update_baseline={steps:'invalid'};assert.throws(()=>referencedFiles(tables),/Invalid repair update baseline/);
});
