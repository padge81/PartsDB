'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AppShell,type Profile,type SiteMode} from './app-shell';
import {RepairGuide} from './repair-guide';
import {canEditRepair} from '../lib/repair-view';
import {beginRepairUpdate,loadRepairGuide,refreshRepairPhotos,type RepairLog} from '../lib/workshop';
import {exportRepairPdf} from '../lib/workshop-export';
import './workshop.css';

export function RepairGuideViewer({guideId}:{guideId:string}){
  return <AppShell readingMode>{(profile,siteMode)=><GuideReader key={guideId} guideId={guideId} profile={profile} siteMode={siteMode}/>}</AppShell>;
}
function GuideReader({guideId,profile,siteMode}:{guideId:string;profile:Profile;siteMode:SiteMode}){
  const router=useRouter();
  const [job,setJob]=useState<RepairLog|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let alive=true;
    void Promise.resolve().then(async()=>{
      if(!alive)return;
      setLoading(true);setError('');
      try{const loaded=await loadRepairGuide(guideId);if(alive)setJob(loaded);}
      catch(e){if(alive){setJob(null);setError(e instanceof Error?e.message:'The guide could not be loaded.');}}
      finally{if(alive)setLoading(false);}
    });
    return()=>{alive=false;};
  },[guideId,attempt]);
  const canUpdate=!!job&&siteMode!=='standby'&&((job.publication_status==='approved'&&!job.update_of)||canEditRepair(job,profile.id,profile.role==='admin'));
  async function updateLog(){
    if(!job||busy||!canUpdate)return;setBusy(true);setError('');
    try{
      const target=job.publication_status==='approved'&&!job.update_of?(await beginRepairUpdate(job)).draft:job;
      router.push('/workshop/logs?log='+encodeURIComponent(target.id)+'&view=edit');
    }catch(e){setError(e instanceof Error?e.message:'The update could not be opened.');}
    finally{setBusy(false);}
  }
  async function downloadPdf(){
    if(!job||busy)return;setBusy(true);setError('');
    try{const refreshed=await refreshRepairPhotos(job);setJob(refreshed);await exportRepairPdf(refreshed,false);}
    catch(e){setError(e instanceof Error?e.message:'The PDF could not be downloaded.');}
    finally{setBusy(false);}
  }
  return <main className="guide-reader-page" aria-label="Workshop guide viewer">
    <a className="back-link" href="/workshop/logs">← Repair logs</a>
    {loading?<section className="detail-state"><div className="spinner"/><p>Loading guide…</p></section>:<>
      {error&&<div className="wk-alert" role="alert">{error}{!job&&<p><button className="button secondary" disabled={busy} onClick={()=>setAttempt(n=>n+1)}>Retry loading</button></p>}</div>}
      {job&&<RepairGuide standalone job={job} canEdit={canUpdate} busy={busy} preview={false} onEdit={()=>void updateLog()} onExport={()=>void downloadPdf()}/>}
    </>}
  </main>;
}
