'use client';
/* eslint-disable @next/next/no-img-element -- Thumbnails use precompressed private or device-local images. */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createRepairAutosave } from '../lib/repair-autosave';
import { readRecoveries, writeRecovery, removeRecovery, recoverySession, type RecoveryDraft } from '../lib/repair-recovery';
import { AppShell, type Profile, type SiteMode } from './app-shell';
import { RepairStepDialog } from './repair-step-dialog';
import { prepareImage, formatBytes } from '../lib/image-compression';
import { refreshRepairPhotos, loadMachineParts, transitionRepair, demoLog, imageDataUrl, loadLive, loadPreview, newLog, prompts, saveLive, savePreview, uploadRepairPhoto, type Choice, type RepairLog, type RepairStep } from '../lib/workshop';
import { exportRepairArchive, exportRepairPdf } from '../lib/workshop-export';
import { RepairPublication } from './repair-publication';
import { BenchReferences } from './bench-references';
import './workshop.css';

export function Workshop({ preview = false, reviewMode = false }: { preview?: boolean; reviewMode?: boolean }) {
  if (preview) return <div className="wk-preview"><header className="wk-preview-header"><a href="/workshop/preview">PartsDB <span>Workshop</span></a><span>INTERACTIVE PREVIEW</span></header><div className="wk-preview-notice">Isolated preview · fictional sample · saves on this device only · production database untouched</div><WorkshopEditor preview siteMode="live" profile={{id:'preview',display_name:'',role:'admin',is_active:true}}/></div>;
  return <AppShell requireAdmin={reviewMode}>{(profile, siteMode) => <WorkshopEditor profile={profile} siteMode={siteMode} reviewMode={reviewMode}/>}</AppShell>;
}
function WorkshopEditor({preview = false,profile,siteMode,reviewMode=false}: {preview?: boolean;profile: Profile;siteMode: SiteMode;reviewMode?:boolean}) {
  const [logs,setLogs] = useState<RepairLog[]>([]), [job,setJob] = useState<RepairLog|null>(null);
  const [machines,setMachines] = useState<Choice[]>([]), [parts,setParts] = useState<Choice[]>([]);
  const [partsMachineId,setPartsMachineId]=useState<string|null>(null),[partsLoading,setPartsLoading]=useState(false),[partsError,setPartsError]=useState('');
  const [scope,setScope]=useState(reviewMode?'pending':'mine');
  const [search,setSearch] = useState(''), [filter,setFilter] = useState('all'), [partSearch,setPartSearch] = useState('');
  const [busy,setBusy] = useState(false), [loading,setLoading] = useState(true), [dirty,setDirty] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
  const [saveInfo,setSaveInfo]=useState({saving:false,error:'',backupError:'',deviceSaved:false});
  const [recoveries,setRecoveries]=useState<RecoveryDraft[]>([]);
  const recoveryAccount=(preview?'preview:':'live:')+profile.id;
  const autosaver=useMemo(()=>{
    const session=recoverySession(),account=(preview?'preview:':'live:')+profile.id;
    return createRepairAutosave({
      persist:preview?savePreview:saveLive,
      backup:log=>writeRecovery(account,session,log),
      clear:id=>removeRecovery(account+':'+session+':'+id),
      onSaved:saved=>setLogs(all=>[saved,...all.filter(x=>x.id!==saved.id)]),
      onRecoveredSaved:(key,id)=>{
        setRecoveries(all=>all.filter(d=>d.key!==key));
        if(key!==account+':'+session+':'+id)void removeRecovery(key).catch(()=>{});
      },
    });
  },[preview,profile.id]);
  useEffect(()=>autosaver.subscribe(state=>{
    setJob(state.job);setDirty(state.dirty);
    setSaveInfo({saving:state.saving,error:state.error,backupError:state.backupError,deviceSaved:state.deviceSaved});
  }),[autosaver]);
  const [section,setSection] = useState<'record'|'steps'|'parts'|'finish'>('record');
  const [view,setView] = useState<'repairs'|'references'>('repairs');
  const [activeStepId,setActiveStepId] = useState<string|null>(null);
  const [exportMode,setExportMode] = useState<'report'|'guide'>('report');
  const gallery = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const standby=siteMode==='standby',admin=profile.role==='admin';
  const owner=!job?.owner_id||job.owner_id===profile.id;
  const publication=job?.publication_status??'private';
  const readonly=standby||(!preview&&!(owner&&['private','returned'].includes(publication))&&!(admin&&['pending','approved','returned'].includes(publication)));
  useEffect(() => { let alive = true; (async () => {
    try {
      try{const drafts=await readRecoveries(recoveryAccount);if(alive)setRecoveries(drafts);}catch(e){if(alive)setError(e instanceof Error?e.message:'Device recovery unavailable.');}
      if(preview) { const saved = await loadPreview(); if(alive) { const all = saved.length ? saved : [demoLog()]; setLogs(all); autosaver.open(all[0],all[0].revision===0); setMachines([{id:'demo-machine',name:'Example claw machine'},{id:'demo-hockey',name:'Example hockey machine'}]); } }
      else { const result = await loadLive(); if(alive) {setLogs(result.records); const requested=new URLSearchParams(window.location.search).get('log');
        const initial=requested?result.records.find(r=>r.id===requested):result.records.find(r=>reviewMode?r.publication_status==='pending':r.owner_id===profile.id);
        autosaver.open(initial??null);if(requested){setScope('all');if(!initial)setError('This repair is unavailable or you do not have permission to view it.');} setMachines(result.machines);} }
    } catch(e) {if(alive) setError(e instanceof Error ? e.message : 'Could not load workshop.');} finally {if(alive)setLoading(false);}
  })(); return () => {alive = false;}; },[preview,profile.id,reviewMode,recoveryAccount,autosaver]);
  const selectedMachineId=job?.machine_id??null;
  useEffect(()=>{
    let alive=true;
    void Promise.resolve().then(async()=>{
      if(!alive)return;
      setParts([]);setPartsMachineId(null);setPartsError('');setPartsLoading(!!selectedMachineId);
      if(!selectedMachineId)return;
      try{
        const choices=preview?(selectedMachineId==='demo-machine'?[{id:'demo-motor',name:'Example replacement motor',number:'DEMO-001'}]:selectedMachineId==='demo-hockey'?[{id:'demo-switch',name:'Example microswitch',number:'DEMO-002'}]:[]):await loadMachineParts(selectedMachineId);
        if(alive){setParts(choices);setPartsMachineId(selectedMachineId);}
      }catch(e){if(alive)setPartsError(e instanceof Error?e.message:'Compatible parts could not be loaded.');}
      finally{if(alive)setPartsLoading(false);}
    });
    return()=>{alive=false;};
  },[preview,selectedMachineId]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => {if(autosaver.getState().dirty) {event.preventDefault(); event.returnValue='';}}; window.addEventListener('beforeunload',warn); return()=>window.removeEventListener('beforeunload',warn); },[autosaver]);
  useEffect(()=>{
    if(!dirty||!job||readonly||busy)return;
    const timer=window.setTimeout(()=>{void autosaver.flush().catch(()=>{});},1200);
    return()=>window.clearTimeout(timer);
  },[job,dirty,readonly,busy,autosaver]);
  useEffect(()=>{
    const flush=()=>{if(!readonly&&!busy)void autosaver.flush().catch(()=>{});};
    const hidden=()=>{if(document.visibilityState==='hidden'){void autosaver.backup().catch(()=>{});flush();}};
    window.addEventListener('online',flush);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('online',flush);document.removeEventListener('visibilitychange',hidden);};
  },[autosaver,readonly,busy]);
  const saveStatus=saveInfo.saving?'Saving…':saveInfo.error?(saveInfo.deviceSaved?'Saved on this device · Workshop save needs attention':'Not saved · retry required'):dirty?(saveInfo.deviceSaved?'Saved on this device · syncing…':'Saving draft…'):job?.revision?(preview?'Saved on this device':'Saved to Workshop'):'Ready';
  function update(patch:Partial<RepairLog>){if(readonly)return;autosaver.edit(patch);setMessage('');}
  function stepUpdate(id:string,patch:Partial<RepairStep>){const current=autosaver.getState().job;if(current)update({steps:current.steps.map(s=>s.id===id?{...s,...patch}:s)});}
  async function select(log:RepairLog){
    if(busy)return;setBusy(true);setError('');
    try{await autosaver.flush();const current=autosaver.getState().job;autosaver.open(current?.id===log.id?current:log);setActiveStepId(null);setMessage('');setSection('record');}
    catch(e){setError(e instanceof Error?e.message:'Save failed. Your draft has been kept.');}
    finally{setBusy(false);}
  }
  async function create(){
    if(busy||standby)return;setBusy(true);setError('');
    try{await autosaver.flush();const created=newLog();created.owner_id=profile.id;created.publication_status='private';created.technician=profile.display_name??'';
      autosaver.open(created,true);setScope('mine');setActiveStepId(null);setSection('record');setMessage('');setView('repairs');
    }catch(e){setError(e instanceof Error?e.message:'Save failed. Your draft has been kept.');}
    finally{setBusy(false);}
  }
  async function save(){
    if(!job||readonly)return;setError('');setMessage('');
    try{await autosaver.flush();setMessage(preview?'Saved on this device.':'Saved to Workshop. Available on your other signed-in devices.');}
    catch(e){setError(e instanceof Error?e.message:'Save failed. Please retry.');}
  }
  function flushStep(){if(!readonly&&!busy)void autosaver.flush().catch(()=>{});}
  async function restoreDraft(draft:RecoveryDraft){
    if(busy)return;setBusy(true);setError('');
    try{
      await autosaver.flush();
      const recovered=preview?draft.log:await refreshRepairPhotos(draft.log);
      autosaver.recoverFrom(draft.key,draft.log.id);autosaver.open(recovered,true);await autosaver.backup();
      setScope('all');setSection('record');setView('repairs');setActiveStepId(null);
      setMessage('Device draft restored. Automatic saving will check for changes from other devices.');
    }catch(e){setError(e instanceof Error?e.message:'Recovery could not be opened. The device copy is still available.');}
    finally{setBusy(false);}
  }
  async function recoveryExport(draft:RecoveryDraft){
    if(busy)return;setBusy(true);setError('');
    try{const recovered=preview?draft.log:await refreshRepairPhotos(draft.log);await exportRepairArchive([recovered]);}
    catch(e){setError(e instanceof Error?e.message:'Recovery export failed.');}
    finally{setBusy(false);}
  }
  async function discardRecovery(draft:RecoveryDraft){
    if(busy||!window.confirm('Delete this device recovery copy? This does not delete the saved Workshop log.'))return;
    try{await removeRecovery(draft.key);setRecoveries(all=>all.filter(d=>d.key!==draft.key));}
    catch(e){setError(e instanceof Error?e.message:'The device copy could not be removed.');}
  }
  async function publicationAction(action:'submit'|'withdraw'|'approve'|'return',notes=''){
    if(!job||busy||standby||preview)return;
    setBusy(true);setError('');setMessage('');
    try{
      if(action==='submit'){
        if(!job.machine_id)throw new Error('Choose a catalogue machine in Job details before submitting.');
        if(!job.steps.length)throw new Error('Add at least one step before submitting.');
      }
      const persisted=await autosaver.flush();
      if(!persisted)throw new Error('No repair selected.');
      const saved=await transitionRepair(persisted,action,notes);
      autosaver.open(saved);setLogs(all=>[saved,...all.filter(x=>x.id!==saved.id)]);
      setMessage(action==='approve'?'Approved. This repair is now visible to all signed-in users and on the linked machine.':action==='return'?'Returned with your review note. This repair is no longer in the shared library.':action==='withdraw'?'Submission withdrawn. You can edit your private draft.':'Submitted for administrator approval.');
    }catch(e){setError(e instanceof Error?e.message:'The review action failed.');}finally{setBusy(false);}
  }
  async function photos(event:ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files??[]);event.target.value='';if(!job||!files.length||readonly||busy)return;
    if(job.steps.length+files.length>60){setError('Keep a job to 60 steps or fewer. Split a longer procedure into separate jobs.');return;}
    setBusy(true);setError('');const additions:RepairStep[]=[];
    try {for(const file of files){const prepared=await prepareImage(file);try {const data=await imageDataUrl(prepared.file);const path=preview?'':await uploadRepairPhoto(job.id,prepared.file);const added:RepairStep={id:crypto.randomUUID(),title:'',instruction:'',image_path:path,imageUrl:data,annotations:[]};additions.push(added);update({steps:[...(autosaver.getState().job?.steps??[]),added]});setMessage(`${file.name}: ${formatBytes(prepared.originalBytes)} to ${formatBytes(prepared.compressedBytes)}`);}finally{URL.revokeObjectURL(prepared.previewUrl);}}}
    catch(e){setError(e instanceof Error?e.message:'Photo upload failed.');}
    finally{if(additions.length){setActiveStepId(additions[0].id);}setSection('steps');setBusy(false);}
  }
  function addTextStep(){if(!job||readonly||job.steps.length>=60)return;const step:RepairStep={id:crypto.randomUUID(),title:'',instruction:'',image_path:'',annotations:[]};update({steps:[...job.steps,step]});setActiveStepId(step.id);flushStep();}
  function openSteps(){if(!job||busy)return;if(job.steps.length)setActiveStepId(job.steps[0].id);else if(!readonly)addTextStep();}
  async function setStepPhoto(stepId:string,file:File){
    if(!job||busy||readonly)return;setBusy(true);setError('');
    try{const prepared=await prepareImage(file);try{
      const imageUrl=await imageDataUrl(prepared.file),image_path=preview?'':await uploadRepairPhoto(job.id,prepared.file);
      stepUpdate(stepId,{imageUrl,image_path,annotations:[]});
      setMessage(`Photo ready: ${formatBytes(prepared.compressedBytes)}. Saving automatically.`);
    }finally{URL.revokeObjectURL(prepared.previewUrl);}}
    catch(e){setError(e instanceof Error?e.message:'Photo could not be added.');}finally{setBusy(false);}
  }
  const activeStepIndex=job?.steps.findIndex(step=>step.id===activeStepId)??-1;
  const activeStep=job?.steps[activeStepIndex];
  function moveStep(index:number,offset:number){if(!job||busy||readonly||index+offset<0||index+offset>=job.steps.length)return;const next=[...job.steps];[next[index],next[index+offset]]=[next[index+offset],next[index]];update({steps:next});}
  async function output(kind:'pdf'|'zip'){
    if(!job||busy)return;setBusy(true);setError('');
    try{
      const saved=readonly?job:await autosaver.flush();
      if(!saved)throw new Error('No repair selected.');
      if(readonly&&dirty)throw new Error('This repair cannot be saved in the current mode. Restore editing or download the device recovery copy.');
      if(kind==='pdf')await exportRepairPdf(saved,exportMode,preview);else await exportRepairArchive([saved]);
      setMessage(kind==='pdf'?'Saved repair PDF downloaded.':'Saved repair ZIP downloaded.');
    }catch(e){setError((e instanceof Error?e.message:'Export failed.')+' Export did not complete. Your on-screen draft is retained.');}
    finally{setBusy(false);}
  }
  const visible=logs.filter(l=>(preview||scope==='all'||(scope==='mine'?l.owner_id===profile.id:l.publication_status===scope))&&(filter==='all'||l.status===filter)&&`${l.title} ${l.machine_name} ${l.fault} ${l.parts.map(p=>p.description+' '+p.number).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const matchingParts=(selectedMachineId&&partsMachineId===selectedMachineId?parts:[]).filter(p=>`${p.name} ${p.number}`.toLowerCase().includes(partSearch.toLowerCase())).filter(p=>!job?.parts.some(x=>x.part_id===p.id)).slice(0,15);
  return <main className="wk-workspace">
    <div className="wk-heading"><div><p className="wk-eyebrow">YOUR WORKSHOP KNOWLEDGE</p><h1>{view==='repairs'?'Repair notebook':'Bench references'}</h1><p>{view==='repairs'?'Capture it once. Find it on the next repair.':'The details you reach for at the bench.'}</p></div><button className="button primary" onClick={create} disabled={busy||standby||loading}>＋ New repair</button></div>
    {!!recoveries.length&&<section className="wk-publication" aria-label="Device recovery drafts"><strong>Recoverable drafts on this device</strong><p>These copies may contain work that was not saved to Workshop. Restoring keeps the original revision, so a newer saved version will not be overwritten.</p>{recoveries.map(draft=><div key={draft.key}><p><strong>{draft.log.title}</strong> · {new Date(draft.savedAt).toLocaleString()}</p><div className="wk-ref-actions"><button className="button primary" disabled={busy||loading} onClick={()=>void restoreDraft(draft)}>Restore draft</button><button className="button secondary" disabled={busy} onClick={()=>void recoveryExport(draft)}>Download recovery ZIP</button><button className="button secondary" disabled={busy} onClick={()=>void discardRecovery(draft)}>Dismiss recovery copy</button></div></div>)}</section>}
    <div className="wk-view-tabs"><button className={view==='repairs'?'active':''} onClick={()=>setView('repairs')}>Repair logs</button><button className={view==='references'?'active':''} onClick={()=>setView('references')}>Bench references</button></div>
    <div hidden={view!=='references'}><BenchReferences preview={preview} readonly={standby}/></div><div hidden={view!=='repairs'}><div className="wk-layout"><aside className="wk-library"><div className="wk-library-head"><strong>Repair logs</strong><span>{logs.length}</span></div>{!preview&&<label className="wk-label">Library<select value={scope} onChange={e=>setScope(e.target.value)}><option value="mine">My repairs</option><option value="approved">Approved library</option>{admin&&<option value="pending">Awaiting approval</option>}{admin&&<option value="returned">Returned for changes</option>}<option value="all">All available repairs</option></select></label>}<label className="wk-label">Search repairs<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Machine, symptom or part…"/></label><label className="wk-label">Status<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All repairs</option><option value="draft">Draft</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></label><div className="wk-log-list">{loading?<p>Loading repair logs…</p>:visible.map(l=><button disabled={busy} key={l.id} className={`wk-log ${job?.id===l.id?'active':''}`} onClick={()=>select(l)}><span className={`wk-status ${l.status}`}>{l.status.replace('_',' ')}</span><strong>{l.title}</strong><span>{l.machine_name||'Machine not recorded'}</span><small>{l.job_date} · {l.steps.length} steps · {(l.publication_status??'private').replace('_',' ')}</small></button>)}{!loading&&!visible.length&&<p className="wk-small">No matching repairs. Start a new log or change your search.</p>}</div><div className="wk-library-note"><strong>Private by default</strong><p>{preview?'Try the workflow here. Preview records are stored only in this browser.':'Drafts stay private. Submitted logs are visible to administrators; approved logs are shared with all signed-in users.'}</p></div></aside>
    <section className="wk-editor" aria-label="Repair editor">
      {(error||saveInfo.error||saveInfo.backupError)&&<div className="wk-alert" role="alert">{error||saveInfo.error}{saveInfo.backupError&&<p>{saveInfo.backupError}</p>}{dirty&&<p>Keep this page open until saved. You can retry with Save now.</p>}{dirty&&job&&<button className="button secondary" disabled={busy} onClick={()=>void recoveryExport({key:'',account:recoveryAccount,session:'',savedAt:new Date().toISOString(),log:job})}>Download unsaved recovery ZIP</button>}</div>}{message&&<div className="wk-message" role="status">{message}</div>}
      {!job?<div className="wk-empty"><h2>Your next repair starts here</h2><p>Create a log, take photos and build a guide as you work.</p><button className="button primary" disabled={loading||busy||standby} onClick={create}>New repair</button></div>:<>
        <div className="wk-editor-top"><div><span className={`wk-status ${job.status}`}>{job.status.replace('_',' ')}</span><span className="wk-save-state">{saveStatus}</span><h2>{job.title}</h2></div><button className="button primary" disabled={busy||readonly||saveInfo.saving} onClick={()=>void save()}>{saveInfo.saving?'Saving…':'Save now'}</button></div>
        {readonly&&<p className="wk-alert">{standby?'This server is in standby. Viewing and export remain available.':'Viewing only. Submitted and approved repairs can only be edited by an administrator.'}</p>}
        {!preview&&<RepairPublication key={job.id} job={job} owner={owner} admin={admin} busy={busy} standby={standby} dirty={dirty} onAction={(action,notes)=>void publicationAction(action,notes)}/>}
        {job.machine_id&&!preview&&<p className="wk-machine-link"><a href={`/machines/${job.machine_id}`}>Open linked machine →</a></p>}
        <div className="wk-tabs" aria-label="Repair sections">{([['record','01','Job details'],['steps','02',`Steps (${job.steps.length})`],['parts','03',`Parts (${job.parts.length})`],['finish','04','Finish & export']] as const).map(([id,n,label])=><button key={id} aria-pressed={section===id} disabled={busy} onClick={()=>{flushStep();setSection(id);if(id==='steps')openSteps();}}><span>{n}</span>{label}</button>)}</div>
        <fieldset className="wk-fields" disabled={busy||(readonly&&section!=='steps')}>
        {section==='record'&&<div className="wk-panel"><div className="wk-section-heading"><h3>What are you working on?</h3><p>Start with what you know. Add the rest as the job progresses.</p></div><label className="wk-label">Repair title<input value={job.title} onChange={e=>update({title:e.target.value})} maxLength={200}/></label><div className="wk-two"><label className="wk-label">Machine<select value={job.machine_id??''} onChange={e=>update({machine_id:e.target.value||null,machine_name:machines.find(m=>m.id===e.target.value)?.name??job.machine_name})}><option value="">Choose a machine…</option>{machines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="wk-label">Machine name / asset reference<input value={job.machine_name} onChange={e=>update({machine_name:e.target.value})} placeholder="Model or cabinet identifier"/></label><label className="wk-label">Job date<input type="date" value={job.job_date} onChange={e=>update({job_date:e.target.value})}/></label><label className="wk-label">Technician<input value={job.technician} onChange={e=>update({technician:e.target.value})}/></label></div><label className="wk-label">Reported fault or task<textarea rows={4} value={job.fault} onChange={e=>update({fault:e.target.value})} placeholder="What was happening? When did it occur?"/></label><label className="wk-label">Tools and preparation<textarea rows={3} value={job.tools} onChange={e=>update({tools:e.target.value})} placeholder="Record tools, access requirements and relevant preparation."/></label><p className="wk-small">Use the microphone on your phone keyboard to dictate into any notes field.</p></div>}
        {section==='steps'&&<div className="wk-panel"><div className="wk-section-heading"><h3>Show the next technician</h3><p>Photograph each stage, mark the parts and explain the action.</p></div><fieldset className="wk-fields wk-capture" disabled={busy||readonly}><button className="button primary" onClick={()=>camera.current?.click()}>Take photo</button><button className="button secondary" onClick={()=>gallery.current?.click()}>Add photos</button><button className="button secondary" disabled={job.steps.length>=60} onClick={addTextStep}>Add text step</button><input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={photos}/><input ref={gallery} hidden type="file" accept="image/*" multiple onChange={photos}/></fieldset><p className="wk-small">Same as PartsDB: WebP, 1600 px maximum, 78% quality. Up to 15 MB per source photo.</p>
          {!job.steps.length&&<div className="wk-empty"><h3>No steps yet</h3><p>Take a photo or add a text step to start the sequence.</p></div>}
          <div className="wk-step-strip" aria-label="Repair steps, left to right">{job.steps.map((step,index)=><article key={step.id} className="wk-step-card"><button type="button" className="wk-step-open" onClick={()=>setActiveStepId(step.id)} aria-label={`Open step ${index+1}: ${step.title||'Untitled step'}`}><span className="wk-step-number">{String(index+1).padStart(2,'0')}</span>{step.imageUrl?<img src={step.imageUrl} alt=""/>:<span className="wk-text-step-icon">Aa</span>}<strong>{step.title||'Untitled step'}</strong><span>{step.instruction||'Add instructions…'}</span><small>{step.annotations.length?`${step.annotations.length} marks · `:''}Open step</small></button><div className="wk-step-order"><button type="button" aria-label={`Move step ${index+1} left`} disabled={busy||readonly||index===0} onClick={()=>moveStep(index,-1)}>←</button><button type="button" aria-label={`Move step ${index+1} right`} disabled={busy||readonly||index===job.steps.length-1} onClick={()=>moveStep(index,1)}>→</button><button type="button" disabled={busy||readonly} aria-label={`Remove step ${index+1}`} onClick={()=>{if(window.confirm('Remove this step from the log?'))update({steps:job.steps.filter(s=>s.id!==step.id)});}}>Remove</button></div></article>)}</div>
          {!!job.steps.length&&<p className="wk-small">Browse steps left to right. Open any step to edit, then use Previous and Next. The arrows below each card change its position.</p>}
        </div>}
        {section==='parts'&&<div className="wk-panel"><div className="wk-section-heading"><h3>Parts used in this repair</h3><p>Choose from catalogue parts compatible with the machine selected in Job details. Already linked parts are kept if you change machines.</p></div>{preview&&<p className="wk-small">Fictional examples filtered to your selected demonstration machine.</p>}<div className="wk-linked-parts">{job.parts.map(p=><div className="wk-linked-part" key={p.part_id}><div><strong>{p.description}</strong><small>{p.number||'No part number'}</small>{!preview&&<a href={`/parts/${p.part_id}`} target="_blank" rel="noreferrer">Open part record</a>}</div><label className="wk-label">Quantity<input type="number" min="1" step="1" value={p.quantity} onChange={e=>update({parts:job.parts.map(x=>x.part_id===p.part_id?{...x,quantity:Number(e.target.value)}:x)})}/></label><button className="button secondary" onClick={()=>update({parts:job.parts.filter(x=>x.part_id!==p.part_id)})}>Remove</button></div>)}</div><label className="wk-label">Find a compatible part<input disabled={!selectedMachineId||partsLoading||partsMachineId!==selectedMachineId} value={partSearch} onChange={e=>setPartSearch(e.target.value)} placeholder="Part number or description"/></label><div className="wk-part-results">{matchingParts.map(p=><button key={p.id} onClick={()=>update({parts:[...job.parts,{part_id:p.id,description:p.name,number:p.number??'',quantity:1}]})}><span><strong>{p.name}</strong><small>{p.number||'No part number'}</small></span><span>＋ Link</span></button>)}{!selectedMachineId?<p>Choose a catalogue machine in Job details to find compatible parts.</p>:partsError?<p role="alert">{partsError}</p>:partsLoading||partsMachineId!==selectedMachineId?<p>Loading compatible parts…</p>:!matchingParts.length&&<p>No matching unlinked parts for this machine.</p>}</div></div>}
        {section==='finish'&&<div className="wk-panel"><div className="wk-section-heading"><h3>Close the loop</h3><p>Record the result so a future repair starts with evidence.</p></div><label className="wk-label">Testing and verification<textarea rows={4} value={job.tests} onChange={e=>update({tests:e.target.value})} placeholder="What did you test, and what was the result?"/></label><label className="wk-label">Outcome and outstanding work<textarea rows={4} value={job.outcome} onChange={e=>update({outcome:e.target.value})} placeholder="Was the fault resolved? What still needs attention?"/></label><label className="wk-label">Job status<select value={job.status} onChange={e=>update({status:e.target.value as RepairLog['status']})}><option value="draft">Draft</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></label><div className="wk-questions"><h4>Useful details to capture</h4>{prompts(job).length?<ul>{prompts(job).map(p=><li key={p}>{p}</li>)}</ul>:<p>The core job details are recorded.</p>}<p className="wk-small">Checklist prompts. AI interviewing and image search are not connected yet.</p></div></div>}
        </fieldset>
        {section==='finish'&&<div className="wk-export"><div><p className="wk-eyebrow">TAKE IT TO THE BENCH</p><h3>A clear, printable record</h3><p>A4 layout, numbered photos and page numbers. Your repair is saved automatically before export.</p></div><div className="wk-export-actions"><label className="wk-label">PDF format<select disabled={busy} value={exportMode} onChange={e=>setExportMode(e.target.value as 'report'|'guide')}><option value="report">Repair report</option><option value="guide">Workshop guide</option></select></label><button disabled={busy} className="button primary" onClick={()=>void output('pdf')}>Download PDF</button><button disabled={busy} className="button secondary" onClick={()=>void output('zip')}>Export job ZIP</button><p className="wk-small">ZIP keeps the unmarked photos and editable annotations for future migration.</p></div></div>}
      </>}
    </section></div></div>
    {activeStep&&job&&<RepairStepDialog step={activeStep} index={activeStepIndex} count={job.steps.length} busy={busy} readonly={readonly} dirty={dirty} saveStatus={saveStatus} error={error||saveInfo.error||saveInfo.backupError} message={message} onChange={patch=>stepUpdate(activeStep.id,patch)} onNavigate={index=>{flushStep();setActiveStepId(job.steps[index].id);}} onClose={()=>{flushStep();setActiveStepId(null);}} onSave={()=>void save()} onAdd={addTextStep} onMove={offset=>moveStep(activeStepIndex,offset)} onPhoto={file=>void setStepPhoto(activeStep.id,file)}/>}
  </main>;
}
