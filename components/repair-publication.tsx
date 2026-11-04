'use client';
import {useState} from 'react';
import {repairUpdateChanges} from '../lib/repair-updates';
import type {RepairLog} from '../lib/workshop';

export function RepairPublication({job,owner,admin,busy,standby,dirty,comparisonStale=false,onAction}:{job:RepairLog;owner:boolean;admin:boolean;busy:boolean;standby:boolean;dirty:boolean;comparisonStale?:boolean;onAction:(action:'submit'|'withdraw'|'approve'|'return',notes?:string)=>void}){
  const [notes,setNotes]=useState('');
  const status=job.publication_status??'private';
  const update=!!job.update_of;
  const updateReady=!update||!!job.change_summary?.trim()&&!!job.update_baseline&&repairUpdateChanges(job.update_baseline,job).hasChanges;
  const labels={private:'Private draft',pending:'Awaiting approval',approved:'Approved for everyone',returned:'Changes requested'};
  return <section className="wk-publication" aria-label="Repair publication">
    <strong>{labels[status]}</strong>
    <p>{status==='private'?'Only you can view this draft. Submit it for an administrator to review.':status==='pending'?'You and administrators can view this submission. Withdraw it if you need to make changes.':status==='approved'?'All signed-in users can view and export this repair. Any active signed-in user can propose an update. The approved version stays published during review.':'This repair is not shared publicly. Update it using the review notes, then submit again.'}</p>
    {update&&!updateReady&&['private','returned'].includes(status)&&<p className="wk-small">Make a repair change and describe it in What changed? before submitting.</p>}
    {job.review_notes&&<p><strong>Review note: </strong>{job.review_notes}</p>}
    <div className="wk-ref-actions">
      {owner&&(status==='private'||status==='returned')&&<button className="button primary" disabled={busy||standby||comparisonStale||!updateReady} onClick={()=>onAction('submit')}>{update?'Save & submit update':'Save & submit for approval'}</button>}
      {owner&&status==='pending'&&<button className="button secondary" disabled={busy||standby||dirty} onClick={()=>onAction('withdraw')}>{update?'Withdraw update':'Withdraw submission'}</button>}
    </div>
    {admin&&(status==='pending'||status==='approved')&&<div className="wk-review-controls">
      <label className="wk-label">Review note{status==='approved'?' (required to remove from shared library)':''}<textarea value={notes} disabled={busy||standby} onChange={e=>setNotes(e.target.value)} rows={2}/></label>
      {dirty&&<p className="wk-small">Save your changes before reviewing this version.</p>}
      <div className="wk-ref-actions">{status==='pending'&&<button className="button primary" disabled={busy||standby||dirty||comparisonStale||!updateReady} onClick={()=>onAction('approve',notes)}>{update?'Approve update':'Approve for everyone'}</button>}<button className="button secondary" disabled={busy||standby||dirty||!notes.trim()} onClick={()=>onAction('return',notes)}>{status==='approved'?'Remove approval & return':'Return for changes'}</button></div>
    </div>}
  </section>;
}
