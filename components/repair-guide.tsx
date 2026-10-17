'use client';
import {useRef,useState} from 'react';
import type {RepairLog} from '../lib/workshop';
import {RepairPhoto} from './repair-photo';

export function RepairGuide({job,canEdit,busy,preview,onEdit,onExport}:{job:RepairLog;canEdit:boolean;busy:boolean;preview:boolean;onEdit:()=>void;onExport:()=>void}){
  const [index,setIndex]=useState(-1);
  const heading=useRef<HTMLHeadingElement>(null);
  const step=job.steps[index];
  function go(next:number){
    setIndex(next);
    window.requestAnimationFrame(()=>{
      const node=heading.current;if(!node)return;
      const height=document.querySelector('.app-navigation')?.getBoundingClientRect().height??0;
      node.style.scrollMarginTop=(height+16)+'px';
      node.focus({preventScroll:true});node.scrollIntoView({block:'start'});
    });
  }
  return <article className="repair-guide" aria-label="Repair guide">
    <header className="guide-header">
      <p className="wk-eyebrow">WORKSHOP GUIDE</p><h2>{job.title}</h2>
      <p>{job.machine_name||'Machine not recorded'}{job.job_date?' · '+job.job_date:''}</p>
      {job.publication_status!=='approved'&&<span className="wk-status">{job.status==='draft'?'Draft · not an approved guide':'Not published'}</span>}
      <div className="wk-ref-actions"><button className="button secondary" disabled={busy} onClick={onExport}>Download PDF</button>{canEdit&&<button className="button secondary" disabled={busy} onClick={onEdit}>Edit log</button>}{job.machine_id&&!preview&&<a className="button secondary" href={`/machines/${job.machine_id}`}>Machine details</a>}</div>
    </header>
    <section className="guide-content">
      <h3 ref={heading} tabIndex={-1}>{step?`Step ${index+1} of ${job.steps.length}`:'Before you start'}</h3>
      {!step?<div>
        {job.fault&&<div className="guide-note"><h4>Task / reported fault</h4><p>{job.fault}</p></div>}
        {job.tools&&<div className="guide-note"><h4>Tools and preparation</h4><p>{job.tools}</p></div>}
        <p>{job.steps.length} {job.steps.length===1?'step':'steps'} in this guide.</p>
        {job.steps.length?<button className="button primary" disabled={busy} onClick={()=>go(0)}>Start guide →</button>:<p>No steps have been recorded yet.</p>}
      </div>:<>
        {step.title&&<h4 className="guide-step-title">{step.title}</h4>}
        {step.instruction&&<p className="guide-instruction">{step.instruction}</p>}
        {step.imageUrl?<RepairPhoto key={step.id} step={step} disabled viewOnly onChange={()=>{}}/>:step.image_path?<p className="wk-alert">This step’s photo is unavailable. Reload the guide to try again.</p>:null}
        <nav className="guide-step-nav" aria-label="Guide step navigation">
          <button className="button secondary" disabled={busy} onClick={()=>go(index-1)}>{index===0?'← Overview':'← Previous'}</button>
          {index<job.steps.length-1?<button className="button primary" disabled={busy} onClick={()=>go(index+1)}>Next →</button>:<span className="guide-last-step">Last step</span>}
        </nav>
        {index===job.steps.length-1&&(job.tests||job.outcome)&&<div className="guide-note"><h4>Testing and outcome</h4>{job.tests&&<p><strong>Testing</strong><br/>{job.tests}</p>}{job.outcome&&<p><strong>Outcome</strong><br/>{job.outcome}</p>}</div>}
      </>}
      {!!job.steps.length&&<details className="guide-details"><summary>All steps</summary><ol>{job.steps.map((item,i)=><li key={item.id}><button disabled={busy} aria-current={index===i?'step':undefined} onClick={()=>go(i)}>{item.title||`Step ${i+1}`}</button></li>)}</ol></details>}
      {!!job.parts.length&&<details className="guide-details"><summary>Parts used ({job.parts.length})</summary><ul>{job.parts.map(part=><li key={part.part_id}><strong>{part.quantity} × </strong>{preview?part.description:<a href={`/parts/${part.part_id}`}>{part.description}</a>}{part.number&&<small>{part.number}</small>}</li>)}</ul></details>}
      {(job.tests||job.outcome)&&<details className="guide-details"><summary>Testing and outcome</summary>{job.tests&&<div className="guide-note"><h4>Testing</h4><p>{job.tests}</p></div>}{job.outcome&&<div className="guide-note"><h4>Outcome</h4><p>{job.outcome}</p></div>}</details>}
    </section>
  </article>;
}
