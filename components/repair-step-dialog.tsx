'use client';
import { useEffect, useRef } from 'react';
import { RepairPhoto } from './repair-photo';
import type { RepairStep } from '../lib/workshop';

export function RepairStepDialog({step,index,count,busy,readonly,dirty,error,message,onChange,onNavigate,onClose,onSave}:{
  step:RepairStep;index:number;count:number;busy:boolean;readonly:boolean;dirty:boolean;error:string;message:string;
  onChange:(patch:Partial<RepairStep>)=>void;onNavigate:(index:number)=>void;onClose:()=>void;onSave:()=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=dialog.current;if(!node)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';node.showModal();return()=>{node.close();document.body.style.overflow=previous;};},[]);
  return <dialog ref={dialog} className="wk-step-dialog" aria-labelledby="step-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <header className="wk-dialog-heading"><div><p className="wk-eyebrow">REPAIR SEQUENCE</p><h2 id="step-dialog-title">Step {index+1} of {count}</h2></div><button type="button" className="button secondary" disabled={busy} onClick={onClose} aria-label="Close step editor">Close</button></header>
    <div className="wk-dialog-body">
      {error&&<p className="wk-alert" role="alert">{error}</p>}{message&&<p className="wk-message" role="status">{message}</p>}
      {readonly&&<p className="wk-alert">Standby: viewing only.</p>}
      <fieldset className="wk-fields" disabled={busy||readonly}><div className="wk-dialog-columns">
        <div>{step.imageUrl?<RepairPhoto key={step.id} step={step} disabled={busy||readonly} onChange={annotations=>onChange({annotations})}/>:<div className="wk-empty"><h3>Text step</h3><p>Describe this stage of the repair.</p></div>}</div>
        <div className="wk-step-notes"><label className="wk-label">Step title<input value={step.title} onChange={event=>onChange({title:event.target.value})} placeholder="e.g. Remove the access cover"/></label><label className="wk-label">Instruction<textarea rows={8} value={step.instruction} onChange={event=>onChange({instruction:event.target.value})} placeholder="What needs to be done? Mention the marked parts."/></label></div>
      </div></fieldset>
    </div>
    <footer className="wk-dialog-footer"><div className="wk-dialog-navigation" aria-label="Step navigation"><button type="button" className="button secondary" disabled={busy||index===0} onClick={()=>onNavigate(index-1)}>← Previous</button><span aria-live="polite">{index+1} / {count}</span><button type="button" className="button secondary" disabled={busy||index===count-1} onClick={()=>onNavigate(index+1)}>Next →</button></div><div className="wk-dialog-save"><span className="wk-small">{dirty?'Changes kept in this draft. Save repair to store them.':'All changes saved.'}</span><button type="button" className="button primary" disabled={busy||readonly} onClick={onSave}>{busy?'Saving…':'Save repair'}</button></div></footer>
  </dialog>;
}
