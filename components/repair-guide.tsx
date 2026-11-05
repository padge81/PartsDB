'use client';
import {useState,type CSSProperties} from 'react';
import type {RepairLog,RepairStep} from '../lib/workshop';
import {repairGuideHref,repairGuideSteps} from '../lib/repair-view';
import {WorkshopAction} from './workshop-action';
import {BookOpenIcon,FileDownloadIcon,PencilIcon} from './icons';
import {RepairPhoto} from './repair-photo';

function GuideStep({step,number}:{step:RepairStep;number:number}){
  const [ratio,setRatio]=useState(1);
  const portrait=ratio<1;
  return <section className={`guide-step${portrait?' portrait':''}`} aria-label={`Step ${number}`}>
    <div className="guide-step-layout">
      <div className="guide-step-copy"><h3>Step {number}{step.title.trim()?` — ${step.title}`:''}</h3>{step.instruction.trim()&&<p className="guide-instruction">{step.instruction}</p>}</div>
      {step.imageUrl?<figure style={{'--guide-photo-ratio':ratio} as CSSProperties} onLoadCapture={event=>{const image=event.target;if(image instanceof HTMLImageElement)setRatio(image.naturalWidth/image.naturalHeight);}}><RepairPhoto step={step} disabled viewOnly onChange={()=>{}}/><figcaption>Step {number} — Photo</figcaption></figure>:step.image_path?<p className="wk-alert">This step’s photo is unavailable. Reload the log to try again.</p>:null}
    </div>
  </section>;
}

export function RepairGuide({job,canEdit,busy,preview,onEdit,onExport,onOpenGuide,standalone=false}:{job:RepairLog;canEdit:boolean;busy:boolean;preview:boolean;onEdit:()=>void;onExport:()=>void;onOpenGuide?:()=>void;standalone?:boolean}){
  const steps=repairGuideSteps(job.steps);
  const Title=standalone?'h1':'h2';
  const publication=job.publication_status??'private';
  const labels={private:'Private draft',pending:'Awaiting approval',approved:'Approved repair record',returned:'Changes requested'};
  return <article className="repair-guide" aria-label="Repair log document">
    <div className="guide-toolbar"><span>Viewing repair log</span><div className="wk-ref-actions">{!standalone&&!preview&&(onOpenGuide?<WorkshopAction label="Open guide" icon={<BookOpenIcon aria-hidden="true"/>} disabled={busy} onClick={onOpenGuide}/>:<WorkshopAction label="Open guide" icon={<BookOpenIcon aria-hidden="true"/>} disabled={busy} href={repairGuideHref(job.id)}/>)}<WorkshopAction label="Download PDF" icon={<FileDownloadIcon aria-hidden="true"/>} disabled={busy} onClick={onExport}/>{canEdit&&<button className="button secondary" disabled={busy} onClick={onEdit}><PencilIcon aria-hidden="true"/>Update log</button>}{job.machine_id&&!preview&&<a className="button secondary" href={`/machines/${job.machine_id}`}>Machine details</a>}</div></div>
    <div className="guide-document">
      <header className="guide-header">
        <p className="wk-eyebrow">WORKSHOP GUIDE</p><Title>{job.title}</Title>
        <p className="guide-record-status">{preview?'Demonstration · ':''}{publication==='approved'?'Published guide — verify suitability before reuse':publication==='pending'?'Awaiting approval — not yet published':publication==='returned'?'Changes requested — not yet published':job.update_of?'Update draft — published guide unchanged':'Draft — not yet submitted'}</p>
        <span className={`wk-status ${publication}`}>{labels[publication]}</span>
        <dl className="guide-metadata">{job.machine_manufacturer?.trim()&&<div><dt>Manufacturer</dt><dd>{job.machine_manufacturer}</dd></div>}{job.machine_name.trim()&&<div><dt>Machine</dt><dd>{job.machine_name}</dd></div>}{job.job_date&&<div><dt>Date</dt><dd>{job.job_date}</dd></div>}{job.technician.trim()&&<div><dt>Technician</dt><dd>{job.technician}</dd></div>}</dl>
      </header>
      <div className="guide-content">
        {job.fault.trim()&&<section className="guide-note"><h3>Fault / task</h3><p>{job.fault}</p></section>}
        {job.tools.trim()&&<section className="guide-note"><h3>Tools and preparation</h3><p>{job.tools}</p></section>}
        {!!job.parts.length&&<section className="guide-note"><h3>Parts used</h3><ul className="guide-parts">{job.parts.map(part=><li key={part.part_id}><strong>{part.quantity} × </strong>{preview?part.description:<a href={`/parts/${part.part_id}`}>{part.description}</a>}{part.number&&<span> · {part.number}</span>}</li>)}</ul></section>}
        {steps.map((step,index)=><GuideStep key={step.id} step={step} number={index+1}/>)}
        {!steps.length&&<p className="wk-small">No steps have been recorded yet.</p>}
        {job.tests.trim()&&<section className="guide-note"><h3>Testing and verification</h3><p>{job.tests}</p></section>}
        {job.outcome.trim()&&<section className="guide-note"><h3>Outcome / outstanding work</h3><p>{job.outcome}</p></section>}
      </div>
      <footer className="guide-footer">PartsDB Workshop · {labels[publication]}<br/>Record: {job.id} · Revision: {job.revision}</footer>
    </div>
  </article>;
}
