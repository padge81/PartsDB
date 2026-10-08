'use client';
import { useEffect, useRef, type ChangeEvent } from 'react';
import { RepairPhoto } from './repair-photo';
import type { RepairStep } from '../lib/workshop';

export function RepairStepDialog({step,index,count,busy,readonly,dirty,error,message,onChange,onNavigate,onClose,onSave,onAdd,onMove,onPhoto}:{
  step:RepairStep;index:number;count:number;busy:boolean;readonly:boolean;dirty:boolean;error:string;message:string;
  onChange:(patch:Partial<RepairStep>)=>void;onNavigate:(index:number)=>void;onClose:()=>void;onSave:()=>void;
  onAdd:()=>void;onMove:(offset:number)=>void;onPhoto:(file:File)=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null),gallery=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null);
  useEffect(()=>{const node=dialog.current;if(!node)return;const previous=document.body.style.overflow,opener=document.activeElement;document.body.style.overflow='hidden';node.showModal();return()=>{node.close();document.body.style.overflow=previous;if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();};},[]);
  useEffect(()=>{if(dialog.current)dialog.current.scrollTop=0;},[step.id]);
  function photo(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value='';if(!file||readonly||busy)return;if(step.imageUrl&&!window.confirm('Replace this photo and clear its marks? The step title and instructions will be kept.'))return;onPhoto(file);}
  const last=index===count-1;
  return <dialog ref={dialog} className="wk-step-dialog" aria-labelledby="step-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <header className="wk-dialog-heading"><div><p className="wk-eyebrow">REPAIR SEQUENCE</p><h2 id="step-dialog-title">Step {index+1} of {count}</h2></div><button type="button" className="button secondary" disabled={busy} onClick={onClose} aria-label="Close step editor">Close</button></header>
    <div className="wk-dialog-body">
      {error&&<p className="wk-alert" role="alert">{error}</p>}{message&&<p className="wk-message" role="status">{message}</p>}
      {readonly&&<p className="wk-alert">Standby: viewing only.</p>}
      <fieldset className="wk-fields" disabled={busy||readonly}>
        <div className="wk-step-move" aria-label="Reorder current step"><strong>Move step</strong><button type="button" className="button secondary" disabled={index===0} onClick={()=>onMove(-1)}>← Move step left</button><button type="button" className="button secondary" disabled={last} onClick={()=>onMove(1)}>Move step right →</button></div>
        <div className="wk-dialog-columns">
          <div className="wk-step-notes"><label className="wk-label">Step title<input value={step.title} onChange={event=>onChange({title:event.target.value})} placeholder="e.g. Remove the access cover"/></label><label className="wk-label">Step text / instructions<textarea rows={8} value={step.instruction} onChange={event=>onChange({instruction:event.target.value})} placeholder="Add or edit what needs to be done in this step."/></label></div>
          <div><div className="wk-step-photo-actions"><button type="button" className="button secondary" onClick={()=>camera.current?.click()}>Take photo</button><button type="button" className="button secondary" onClick={()=>gallery.current?.click()}>{step.imageUrl?'Replace photo':'Add photo'}</button><input ref={gallery} hidden type="file" accept="image/*" onChange={photo}/><input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={photo}/></div>{step.imageUrl?<RepairPhoto key={step.id+step.image_path} step={step} disabled={busy||readonly} onChange={annotations=>onChange({annotations})}/>:<div className="wk-empty"><p>Add a photo if helpful. A step can contain just a title and text.</p></div>}</div>
        </div>
      </fieldset>
    </div>
    <footer className="wk-dialog-footer"><div className="wk-dialog-navigation" aria-label="Step navigation"><button type="button" className="button secondary" disabled={busy||index===0} onClick={()=>onNavigate(index-1)}>← Previous</button><span aria-live="polite">{index+1} / {count}</span><button type="button" className={last?'button primary':'button secondary'} disabled={busy||(last&&(readonly||count>=60))} onClick={()=>last?onAdd():onNavigate(index+1)}>{last?'Add step →':'Next →'}</button></div>{last&&count>=60&&<p className="wk-small">This repair has reached the 60-step limit.</p>}<div className="wk-dialog-save"><span className="wk-small">{dirty?'Changes kept in this draft. Save repair to store them.':'All changes saved.'}</span><button type="button" className="button primary" disabled={busy||readonly} onClick={onSave}>{busy?'Working…':'Save repair'}</button></div></footer>
  </dialog>;
}
