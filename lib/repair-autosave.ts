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
  let state:AutosaveState={job:null,dirty:false,saving:false,error:'',backupError:'',deviceSaved:false};
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
    if(running)throw new Error('Wait for the current save to finish.');
    generation++;state={job,dirty,saving:false,error:'',backupError:'',deviceSaved:false};emit();
    if(dirty)void backup().catch(()=>{});
  }
  function edit(patch:Partial<RepairLog>){
    if(!state.job)return;
    generation++;state={...state,job:{...state.job,...patch},dirty:true,error:'',deviceSaved:false};emit();
    void backup().catch(()=>{});
  }
  function flush():Promise<RepairLog|null>{
    if(running)return running;
    if(!state.job||!state.dirty)return Promise.resolve(state.job);
    running=Promise.resolve().then(async()=>{
      state={...state,saving:true,error:''};emit();
      try{
        while(state.job&&state.dirty){
          const snapshot=state.job,version=generation;
          // Try the device copy first, but still allow cloud saving if device storage is full.
          await backup().catch(()=>{});
          const saved=await options.persist(snapshot);
          options.onSaved?.(saved);
          if(restoredSource?.id===saved.id){
            const source=restoredSource;restoredSource=null;
            options.onRecoveredSaved?.(source.key,source.id);
          }
          if(generation===version){
            state={...state,job:saved,dirty:false,deviceSaved:false,backupError:''};emit();
            // Queue cleanup ahead of subsequent edits, so a newer backup cannot be deleted.
            backupQueue=backupQueue.catch(()=>{}).then(()=>options.clear(saved.id));
            await backupQueue.catch(()=>{});
          }else{
            state={...state,job:{...state.job,revision:saved.revision,updated_at:saved.updated_at,owner_id:saved.owner_id,publication_status:saved.publication_status},deviceSaved:false};emit();
            await backup().catch(()=>{});
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
  return {recoverFrom:(key:string,id:string)=>{restoredSource={key,id};},getState:()=>({...state}),open,edit,flush,backup,subscribe(listener:(state:AutosaveState)=>void){listeners.add(listener);listener({...state});return()=>{listeners.delete(listener);};}};
}
