'use client';
import type {RepairLog,RepairStep} from '../lib/workshop';
import {repairUpdateChanges} from '../lib/repair-updates';
import {RepairPhoto} from './repair-photo';

function StepVersion({step,label}:{step?:RepairStep;label:string}){
 return <section><h4>{label}</h4>{step?<><strong>{step.title||'Untitled step'}</strong><p>{step.instruction||'No instructions'}</p>{step.imageUrl?<RepairPhoto step={step} disabled viewOnly onChange={()=>{}}/>:step.image_path?<p className="wk-alert">Photo unavailable. Reload before reviewing.</p>:<p className="wk-small">No photo</p>}</>:<p className="wk-small">Step not present</p>}</section>;
}
export function RepairUpdateReview({job,source,owner,busy,standby,onRefresh}:{job:RepairLog;source?:RepairLog;owner:boolean;busy:boolean;standby:boolean;onRefresh:()=>void}){
 if(!job.update_of||!job.update_baseline)return null;
 const changes=repairUpdateChanges(job.update_baseline,job);
 const stale=!source||source.publication_status!=='approved'||source.revision!==job.update_base_revision;
 const refreshable=owner&&['private','returned'].includes(job.publication_status??'private')&&source?.publication_status==='approved';
 return <section className="repair-update-review" aria-label="Update comparison">
  <h2>Proposed update</h2><p><strong>Submitted by:</strong> {job.author?.display_name||'Update author'} · Compared with approved revision {job.update_base_revision}</p>
  <p>The approved repair stays published until an administrator approves these changes.</p>
  <h3>What changed?</h3><p className="update-summary">{job.change_summary?.trim()||'The author has not described the changes yet.'}</p>
  {stale&&<div className="wk-alert" role="alert">{source?.publication_status==='approved'?'The approved repair has changed since this update began. This update cannot be submitted or approved against the old version.':'The original repair is no longer available as an approved record. This update cannot be published.'}{refreshable?<><p>Refresh the comparison to use the latest approved version. Your draft is kept; review all differences before resubmitting.</p><button className="button secondary" disabled={busy||standby} onClick={onRefresh}>Refresh comparison</button></>:job.publication_status==='pending'?<p>Withdraw this update, or return it to the author, before refreshing the comparison.</p>:null}</div>}
  {!changes.hasChanges&&<p>No repair content has changed.</p>}
  {!!changes.fields.length&&<div className="update-field-changes"><h3>Changed details</h3>{changes.fields.map(field=><div key={field.key}><h4>{field.label}</h4><div className="update-versions"><section><h5>Approved version</h5><p>{field.before||'Not recorded'}</p></section><section><h5>Proposed version</h5><p>{field.after||'Not recorded'}</p></section></div></div>)}</div>}
  {!!changes.steps.length&&<div><h3>Changed steps ({changes.steps.length})</h3>{changes.steps.map(step=><details className="update-step-change" key={step.id} open><summary>{step.after?.title||step.before?.title||'Untitled step'} · {step.added?'Added':step.removed?'Removed':[[step.moved?`Moved from ${(step.beforeIndex??0)+1} to ${(step.afterIndex??0)+1}`:''],[step.textChanged?'Text changed':''],[step.photoChanged?'Photo changed':''],[step.marksChanged?'Markings changed':'']].flat().filter(Boolean).join(' · ')}</summary><div className="update-versions"><StepVersion step={step.before} label="Approved version"/><StepVersion step={step.after} label="Proposed version"/></div></details>)}</div>}
  {!!changes.parts.length&&<div><h3>Changed parts</h3>{changes.parts.map(part=><div key={part.id} className="update-versions"><p><strong>Approved:</strong> {part.before?`${part.before.quantity} × ${part.before.description}`:'Not included'}</p><p><strong>Proposed:</strong> {part.after?`${part.after.quantity} × ${part.after.description}`:'Removed'}</p></div>)}</div>}
 </section>;
}
