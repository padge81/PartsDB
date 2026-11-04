"use client";

import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {AppShell,type SiteMode,type ChangeSiteMode} from './app-shell';
import {getSupabaseBrowserClient} from '../lib/supabase';
import {APP_REVISION} from '../lib/version';
import {allBackupSections,backupSections,backupTables,includedSections,estimateBackup,formatBackupBytes,MAX_BACKUP_BYTES,type BackupSection,type BackupSnapshot} from '../lib/backup-model';
import {buildBackup,validateBackup,type ValidatedBackup} from '../lib/backup-archive';
import {loadBackupSnapshot,closeBackupJob,planBackupRestore,applyBackup,cancelBackupRestore,type RestorePlan} from '../lib/backup-client';

function download(bytes:Uint8Array,name:string,type:string){
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function BackupManager(){
  const [requested,setRequested]=useState<BackupSection[]>([...allBackupSections]);
  const sections=useMemo(()=>includedSections(requested),[requested]);
  const selectionKey=sections.join(',');
  const [refresh,setRefresh]=useState(0);
  const [estimate,setEstimate]=useState<{key:string;snapshot?:BackupSnapshot;error?:string}>({key:''});
  const [prepared,setPrepared]=useState<{bytes:Uint8Array;name:string;key:string}|null>(null);
  const [working,setWorking]=useState(false),[message,setMessage]=useState(''),[isError,setIsError]=useState(false);
  const [backup,setBackup]=useState<ValidatedBackup|null>(null),[fileName,setFileName]=useState(''),[fileSize,setFileSize]=useState<number|null>(null);
  const [mode,setMode]=useState<'merge'|'restore'>('merge'),[confirmation,setConfirmation]=useState('');
  const [restorePlan,setRestorePlan]=useState<RestorePlan|null>(null);
  const allRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(allRef.current)allRef.current.indeterminate=sections.length>0&&sections.length<allBackupSections.length;},[sections.length]);
  useEffect(()=>{
    const client=getSupabaseBrowserClient();if(!client||!selectionKey)return;
    let current=true,session:string|undefined;
    const timer=setTimeout(async()=>{
      try{
        const snapshot=await loadBackupSnapshot(client,selectionKey.split(',') as BackupSection[]);session=snapshot.job_id;
        if(current)setEstimate({key:selectionKey,snapshot});
        else await closeBackupJob(client,snapshot.job_id).catch(()=>{});
      }catch(error){if(current)setEstimate({key:selectionKey,error:error instanceof Error?error.message:'Could not calculate backup size.'});}
    },300);
    return()=>{current=false;clearTimeout(timer);if(session)void closeBackupJob(client,session).catch(()=>{});};
  },[selectionKey,refresh]);
  const snapshot=estimate.key===selectionKey?estimate.snapshot:undefined;
  const stats=snapshot?estimateBackup(snapshot,APP_REVISION):null;
  const estimateError=estimate.key===selectionKey?estimate.error:undefined;
  const pending=sections.length>0&&!snapshot&&!estimateError;

  function changeSections(next:BackupSection[]){setRequested(next);setPrepared(null);setMessage('');setEstimate({key:''});}
  async function prepareExport(){
    const client=getSupabaseBrowserClient();if(!client||!snapshot||working)return;
    setWorking(true);setIsError(false);setMessage('Preparing selected backup…');
    try{
      const result=await buildBackup(snapshot,APP_REVISION,async file=>{
        const response=await client.storage.from(file.bucket).download(file.path);
        if(response.error||!response.data)throw new Error(`Could not download a backup file: ${response.error?.message??'empty response'}`);
        return new Uint8Array(await response.data.arrayBuffer());
      },setMessage);
      setPrepared({bytes:result.bytes,name:result.name,key:selectionKey});
      setMessage('Backup prepared and verified. Check the exact size, then download the ZIP.');
    }catch(error){setMessage(error instanceof Error?error.message:'Backup preparation failed.');setIsError(true);}
    finally{await closeBackupJob(client,snapshot.job_id).catch(()=>{});setWorking(false);setEstimate({key:''});setRefresh(value=>value+1);}
  }
  async function selectFile(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];setBackup(null);setFileName(file?.name??'');setFileSize(file?.size??null);setConfirmation('');setMode('merge');setMessage('');setIsError(false);
    if(!file)return;setWorking(true);
    try{const validated=await validateBackup(file);setBackup(validated);setMessage('Backup checksums, selected sections and all included files verified.');}
    catch(error){setMessage(error instanceof Error?error.message:'Backup could not be validated.');setIsError(true);}
    finally{setWorking(false);}
  }
  async function restore(siteMode:SiteMode,changeSiteMode:ChangeSiteMode){
    const client=getSupabaseBrowserClient();if(!client||!backup||working)return;
    setWorking(true);setIsError(false);setMessage('Checking restore permissions and linked records…');
    try{
      const plan=restorePlan??await planBackupRestore(client,backup,mode,confirmation);setRestorePlan(plan);
      const result=await applyBackup(client,backup,plan,setMessage);
      setMessage(`Restore completed: ${result.records} records and ${result.files} files. Unselected sections were preserved.`);
      setRestorePlan(null);setConfirmation('');setEstimate({key:''});setRefresh(value=>value+1);
      await closeBackupJob(client,plan.job_id).catch(()=>{});
      const completedAt=new Date().toISOString();
      download(new TextEncoder().encode(JSON.stringify({...result,status:'complete',completed_at:completedAt},null,2)),`partsdb-restore-report-${completedAt.replace(/[:.]/g,'-')}.json`,'application/json');
    }catch(error){setMessage((error instanceof Error?error.message:'Restore failed.')+' You can retry this prepared restore or cancel it and validate again.');setIsError(true);}
    finally{
      if(siteMode==='maintenance'){
        const returned=await changeSiteMode("standby");
        if(!returned){setMessage(previous=>previous+' Could not return this server to standby. Use Server mode to restore read-only mode.');setIsError(true);}
      }
      setWorking(false);
    }
  }
  async function cancelRestore(){
    const client=getSupabaseBrowserClient();if(!client||!restorePlan)return;
    setWorking(true);setIsError(false);
    try{const result=await cancelBackupRestore(client,restorePlan);setRestorePlan(null);setMessage(result.committed?'This restore had already completed. Its restored records and files were preserved.':'Prepared restore cancelled. Any uncommitted staged files were removed.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not clean up the prepared restore.');setIsError(true);}
    finally{setWorking(false);}
  }
  return <AppShell requireAdmin>{(_,siteMode,changeSiteMode)=><main className="workspace backup-workspace">
    <a className="back-link" href="/admin">← Back to administrator portal</a>
    <section className="workspace-heading"><div><p className="eyebrow accent">Administrator tools</p><h1>Backup, export &amp; import</h1><p>Select the sections to transfer, check their size, then prepare a verified portable backup.</p></div></section>
    <div className="backup-grid">
      <section className="form-card backup-card"><div className="detail-card-heading"><h2>Export backup</h2><span>Portable ZIP v5</span></div><div className="backup-card-body">
        <fieldset className="backup-section-picker" disabled={working}><legend>Backup sections</legend>
          <label className="backup-select-all"><input ref={allRef} type="checkbox" checked={sections.length===allBackupSections.length} onChange={event=>changeSections(event.target.checked?[...allBackupSections]:[])}/><strong>Select all</strong></label>
          {backupSections.map(section=>{
            const required=includedSections(requested.filter(id=>id!==section.id)).includes(section.id);
            const count=snapshot?backupTables.filter(t=>t.section===section.id).reduce((sum,t)=>sum+(snapshot.tables[t.name]?.length??0),0):null;
            return <label key={section.id}><input type="checkbox" checked={sections.includes(section.id)} disabled={required} onChange={event=>changeSections(event.target.checked?[...requested,section.id]:requested.filter(id=>id!==section.id))}/><span>{section.label}{required&&<small>Required by another selected section</small>}{count!==null&&sections.includes(section.id)&&<small>{count} {count===1?'record':'records'}</small>}</span></label>;
          })}
        </fieldset>
        <p className="backup-help">Required linked sections are included automatically. Photos and documents follow their section.</p>
        <div className="backup-size-preview" aria-live="polite">
          {!sections.length?<p>Select at least one section.</p>:pending?<p>Calculating size from records and stored file information…</p>:estimateError?<><p role="alert">{estimateError}</p><button className="button secondary" type="button" disabled={working} onClick={()=>{setEstimate({key:''});setRefresh(value=>value+1);}}>Retry calculation</button></>:stats&&<>
            <strong>{stats.unknownFiles?`Known data: ${formatBackupBytes(stats.databaseBytes+stats.knownFileBytes)} + unmeasured files`:`Estimated size: ${formatBackupBytes(stats.estimatedBytes)}`}</strong>
            <p>{stats.records} {stats.records===1?'record':'records'} · {stats.files} {stats.files===1?'photo/document':'photos/documents'}</p>
            {stats.unknownFiles>0&&<p>{stats.unknownFiles} files have no stored size. Their bytes will be measured during preparation.</p>}
            <small>Photos and documents have not been downloaded for this estimate. The exact ZIP size appears after preparation.</small>
          </>}
        </div>
        <p className="backup-help">Administrator backups include all users’ selected Workshop records, including private records. Keep the ZIP secure. Sign-in accounts, passwords, system audit history and server settings are excluded.</p>
        {stats&&stats.estimatedBytes>MAX_BACKUP_BYTES&&<p role="alert">This selection exceeds the 1 GB browser limit. Select fewer sections.</p>}
        <button className="button primary" type="button" disabled={working||!snapshot||!!stats&&stats.estimatedBytes>MAX_BACKUP_BYTES} onClick={()=>void prepareExport()}>{working?'Working…':'Prepare selected backup'}</button>
        {prepared?.key===selectionKey&&<div className="backup-ready"><strong>Exact ZIP size: {formatBackupBytes(prepared.bytes.byteLength)} ({prepared.bytes.byteLength.toLocaleString()} bytes)</strong><p>{prepared.name}</p><button className="button primary" disabled={working} type="button" onClick={()=>download(prepared.bytes,prepared.name,'application/zip')}>Download prepared ZIP</button></div>}
      </div></section>
      <section className="form-card backup-card"><div className="detail-card-heading"><h2>Import backup</h2><span>ZIP v4 or v5</span></div><div className="backup-card-body">
        <label className="file-picker">Portable backup ZIP<input type="file" accept="application/zip,.zip" onChange={event=>void selectFile(event)} disabled={working||!!restorePlan}/><small>{fileName||'No file selected'}{fileSize!==null&&` · Exact file size: ${formatBackupBytes(fileSize)} (${fileSize.toLocaleString()} bytes)`}</small></label>
        {backup&&<div className="backup-size-preview"><strong>Included sections</strong><ul>{backup.sections.map(id=><li key={id}>{backupSections.find(s=>s.id===id)?.label}</li>)}</ul><p>{Object.values(backup.tables).reduce((sum,rows)=>sum+rows.length,0)} records · {backup.files.length} photos/documents</p><small>Existing owners are preserved when their accounts exist here. Records from unavailable accounts belong to the restoring administrator.</small></div>}
        <fieldset disabled={working||!!restorePlan}><legend>Import mode</legend>
          <label><input type="radio" name="backup-mode" checked={mode==='merge'} onChange={()=>{setMode('merge');setConfirmation('');}}/><span><strong>Merge included sections</strong><small>Add or update matching records; retain other records and unselected sections.</small></span></label>
          <label><input type="radio" name="backup-mode" disabled={!backup?.canReplace} checked={mode==='restore'} onChange={()=>setMode('restore')}/><span><strong>Replace all sections</strong><small>Requires a v5 backup containing all six sections. All application records are replaced together; accounts and server settings are retained.</small></span></label>
        </fieldset>
        {backup&&!backup.canReplace&&<p className="backup-help">Selected-section and legacy catalogue backups support merge only.</p>}
        {mode==='restore'&&<label className="restore-confirm">Type RESTORE to replace all application records<input value={confirmation} onChange={event=>setConfirmation(event.target.value)} disabled={working||!!restorePlan} autoComplete="off"/></label>}
        <p className="backup-help">Files upload to new paths before records are applied in one transaction. An interrupted upload can be retried. Maintenance imports return this server to standby.</p>
        <button className={`button ${mode==='restore'?'danger':'primary'}`} disabled={working||!backup||siteMode === "standby"||mode==='restore'&&confirmation!=='RESTORE'} type="button" onClick={()=>void restore(siteMode,changeSiteMode)}>{working?'Working…':restorePlan?'Retry prepared restore':mode==='restore'?'Replace all sections':'Import included sections'}</button>
        {restorePlan&&<button className="button secondary" type="button" disabled={working||siteMode==='standby'} onClick={()=>void cancelRestore()}>Cancel prepared restore</button>}
        {siteMode==='standby'&&<p>Standby is read only. Enable Maintenance from Server mode before importing.</p>}
      </div></section>
    </div>
    {message&&<p className={`form-message ${isError?'error-message':'success-message'}`} role={isError?'alert':'status'}>{message}</p>}
  </main>}</AppShell>;
}
