import type {RepairLog} from './workshop';

export type AutosaveState = {job:RepairLog|null;dirty:boolean;saving:boolean;error:string;backupError:string;deviceSaved:boolean};
type Options = {
  persist:(job:RepairLog)=>Promise<RepairLog>;
  backup:(job:RepairLog)=>Promise<void>;
  clear:(id:string)=>Promise<void>;
  onSaved?:(job:RepairLog)=>void;
  onRecoveredSaved?:(key:string,id:string)=>void;
};
export function createRepairAutosave(options:Options){
  // Compare editable content only; refreshed photo URLs and server metadata are not edits.
  const content=(job:RepairLog)=>JSON.stringify([job.title,job.machine_id,job.machine_name,job.technician,job.job_date,job.fault,job.tools,job.tests,job.outcome,job.status,job.change_summary??'',job.steps.map(s=>[s.id,s.title,s.instruction,s.image_path,s.image_path?undefined:s.imageUrl,s.annotations?.map(m=>[m.kind,m.x,m.y,m.x2,m.y2,m.label??''])]),job.parts.map(p=>[p.part_id,p.quantity])]);
  let savedContent:string|null=null;
  const clearBackup=(id:string)=>{backupQueue=backupQueue.catch(()=>{}).then(()=>options.clear(id));return backupQueue;};
  let state:AutosaveState={job:null,dirty:false,saving:false,error:'',backupError:'',deviceSaved:false};
  let removing=false;
  let generation=0,running:Promise<RepairLog|null>|null=null,backupQueue:Promise<void>=Promise.resolve();
  let restoredSource:{key:string;id:string}|null=null;
  const listeners=new Set<(state:AutosaveState)=>void>();
  const emit=()=>{for(const listener of listeners)listener({...state});};
  function backup(){
    const snapshot=state.job,version=generation;
    if(!snapshot||!state.dirty)return backupQueue;
    const operation=backupQueue.catch(()=>{}).then(()=>options.backup(snapshot));
    backupQueue=operation;
    void operation.then(()=>{
      if(state.job?.id===snapshot.id&&generation===version){state={...state,deviceSaved:true,backupError:''};emit();}
    },error=>{
      if(state.job?.id===snapshot.id&&generation===version){state={...state,deviceSaved:false,backupError:'Device recovery could not be saved. Keep this page open until Workshop confirms the save. '+String(error instanceof Error?error.message:error)};emit();}
    });
    return operation;
  }
  function open(job:RepairLog|null,dirty=false){
    if(removing)throw new Error('Wait for deletion to finish.');
    if(running)throw new Error('Wait for the current save to finish.');
    savedContent=job&&!dirty?content(job):null;
    generation++;state={job,dirty,saving:false,error:'',backupError:'',deviceSaved:false};emit();
    if(dirty)void backup().catch(()=>{});
  }
  function edit(patch:Partial<RepairLog>){
    if(!state.job||removing)return;
    const next={...state.job,...patch};
    // An in-flight request may commit even if its acknowledgement is lost.
    const dirty=!!running||savedContent===null||content(next)!==savedContent;
    generation++;state={...state,job:next,dirty,error:'',deviceSaved:false,backupError:dirty?state.backupError:''};emit();
    if(dirty)void backup().catch(()=>{});
    else if(!running)void clearBackup(next.id).catch(()=>{});
  }
  function flush():Promise<RepairLog|null>{
    if(running)return running;
    if(removing||!state.job||!state.dirty)return Promise.resolve(state.job);
    running=Promise.resolve().then(async()=>{
      state={...state,saving:true,error:''};emit();
      try{
        while(state.job&&state.dirty&&!removing){
          const snapshot=state.job,version=generation;
          // Try the device copy first, but still allow cloud saving if device storage is full.
          await backup().catch(()=>{});
          const saved=await options.persist(snapshot);
          savedContent=content(saved);
          options.onSaved?.(saved);
          if(restoredSource?.id===saved.id){
            const source=restoredSource;restoredSource=null;
            options.onRecoveredSaved?.(source.key,source.id);
          }
          if(generation===version){
            state={...state,job:saved,dirty:false,deviceSaved:false,backupError:''};emit();
            // Queue cleanup ahead of subsequent edits, so a newer backup cannot be deleted.
            await clearBackup(saved.id).catch(()=>{});
          }else{
            const current={...state.job,revision:saved.revision,updated_at:saved.updated_at,owner_id:saved.owner_id,publication_status:saved.publication_status};
            state={...state,job:current,dirty:content(current)!==savedContent,deviceSaved:false};emit();
            if(state.dirty)await backup().catch(()=>{});else await clearBackup(saved.id).catch(()=>{});
          }
        }
        return state.job;
      }catch(error){
        state={...state,error:error instanceof Error?error.message:'Save failed. Please retry.'};emit();
        throw error;
      }finally{running=null;state={...state,saving:false};emit();}
    });
    return running;
  }
  async function remove(deleteLog:(job:RepairLog)=>Promise<void>){
    if(removing)throw new Error('Deletion is already in progress.');
    removing=true;
    try{
      // Finish any in-flight request, but do not save further edits before deletion.
      await running?.catch(()=>{});
      const current=state.job;
      if(!current)return;
      await deleteLog(current);
      generation++;restoredSource=null;
      state={job:null,dirty:false,saving:false,error:'',backupError:'',deviceSaved:false};emit();
      await backupQueue.catch(()=>{});
      await options.clear(current.id).catch(()=>{});
    }finally{removing=false;}
  }
  return {remove,recoverFrom:(key:string,id:string)=>{restoredSource={key,id};},getState:()=>({...state}),open,edit,flush,backup,subscribe(listener:(state:AutosaveState)=>void){listeners.add(listener);listener({...state});return()=>{listeners.delete(listener);};}};
}
