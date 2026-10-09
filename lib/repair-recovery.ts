import type {RepairLog} from './workshop';

export type RecoveryDraft={key:string;account:string;session:string;savedAt:string;log:RepairLog};
let database:Promise<IDBDatabase>|undefined;
function db(){
  if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('partsdb-workshop-recovery-v1',1);
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore('drafts',{keyPath:'key'});store.createIndex('account','account');};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{database=undefined;reject(new Error('Device storage is unavailable.'));};
  });
  return database;
}
// A fresh editor session prevents duplicated tabs from overwriting one another's drafts.
export function recoverySession(){return crypto.randomUUID();}
export async function writeRecovery(account:string,session:string,log:RepairLog){
  const database=await db();
  return new Promise<void>((resolve,reject)=>{
    const tx=database.transaction('drafts','readwrite');
    tx.objectStore('drafts').put({key:account+':'+session+':'+log.id,account,session,savedAt:new Date().toISOString(),log} satisfies RecoveryDraft);
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error('The device recovery copy could not be stored.'));
  });
}
export async function readRecoveries(account:string):Promise<RecoveryDraft[]>{
  const database=await db();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('drafts','readonly'),request=tx.objectStore('drafts').index('account').getAll(account);
    request.onsuccess=()=>resolve((request.result as RecoveryDraft[]).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));
    request.onerror=()=>reject(new Error('Device recovery copies could not be read.'));
  });
}
export async function removeRecovery(key:string){
  const database=await db();
  return new Promise<void>((resolve,reject)=>{
    const tx=database.transaction('drafts','readwrite');tx.objectStore('drafts').delete(key);
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error('The recovery copy could not be cleared.'));
  });
}
