import type {Mark,RepairStep,RepairUpdateSnapshot} from './workshop';

const fields=[['title','Title'],['machine_id','Catalogue machine'],['machine_name','Machine name / asset reference'],['technician','Technician'],['job_date','Job date'],['fault','Fault / task'],['tools','Tools and preparation'],['tests','Testing and verification'],['outcome','Outcome / outstanding work'],['status','Job status']] as const;
const marks=(items:Mark[])=>JSON.stringify(items.map(m=>[m.kind,m.x,m.y,m.x2,m.y2,m.label??'']));
export function repairUpdateChanges(before:RepairUpdateSnapshot,after:RepairUpdateSnapshot){
 const changedFields=fields.filter(([key])=>(before[key]??'')!==(after[key]??'')).map(([key,label])=>({key,label,before:key==='machine_id'?(before.machine_name||'No catalogue machine'):String(before[key]??''),after:key==='machine_id'?(after.machine_name===before.machine_name?'Different catalogue machine':after.machine_name||'No catalogue machine'):String(after[key]??'')}));
 const oldSteps=new Map(before.steps.map((step,index)=>[step.id,{step,index}]));
 const newSteps=new Map(after.steps.map((step,index)=>[step.id,{step,index}]));
 const stepChanges=[...new Set([...after.steps.map(s=>s.id),...before.steps.map(s=>s.id)])].map(id=>{
  const previous=oldSteps.get(id),next=newSteps.get(id),a=previous?.step,b=next?.step;
  return {id,before:a,after:b,beforeIndex:previous?.index,afterIndex:next?.index,added:!a,removed:!b,moved:!!previous&&!!next&&previous.index!==next.index,
   textChanged:!!a&&!!b&&(a.title!==b.title||a.instruction!==b.instruction),photoChanged:!!a&&!!b&&(a.image_path||'')!==(b.image_path||''),marksChanged:!!a&&!!b&&marks(a.annotations)!==marks(b.annotations)};
 }).filter(s=>s.added||s.removed||s.moved||s.textChanged||s.photoChanged||s.marksChanged);
 const oldParts=new Map(before.parts.map(p=>[p.part_id,p])),newParts=new Map(after.parts.map(p=>[p.part_id,p]));
 const partChanges=[...new Set([...oldParts.keys(),...newParts.keys()])].map(id=>({id,before:oldParts.get(id),after:newParts.get(id)})).filter(p=>!p.before||!p.after||p.before.quantity!==p.after.quantity);
 return {fields:changedFields,steps:stepChanges,parts:partChanges,hasChanges:!!(changedFields.length||stepChanges.length||partChanges.length)};
}

export function cleanRepairSteps(steps:RepairStep[]){return steps.map(({id,title,instruction,image_path,annotations})=>({id,title,instruction,image_path,annotations}));}
