import { getSupabaseBrowserClient } from './supabase';
import { imageDataUrl } from './workshop';
import { prepareImage } from './image-compression';
import { strToU8, zipSync } from 'fflate';

export type ReferencePhoto = { id: string; path: string; caption: string; imageUrl?: string };
export type ReferenceDocument = { id:string; path:string; name:string; bytes:number; url?:string };
export type Reference = { id: string; title: string; category: string; subcategory: string; body: string; source_url: string; revision: number; updated_at: string; status: 'draft'|'checked'; starter_key: string|null; photos: ReferencePhoto[]; documents: ReferenceDocument[] };
export const categories = ['Pinouts','Threads','Connectors','Bolt heads','Other'];
export function emptyReference(): Reference { return { id:crypto.randomUUID(),title:'',category:'Other',subcategory:'',body:'',source_url:'',revision:0,updated_at:'',status:'draft',starter_key:null,photos:[],documents:[] }; }
export function normalizeReference(r: Reference): Reference { return {...r,subcategory:r.subcategory??'',photos:r.photos??[],documents:r.documents??[],starter_key:r.starter_key??null}; }
export async function previewReferences(write?: Reference): Promise<Reference[]> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('partsdb-bench-preview-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('references',{keyPath:'id'});
    request.onerror=()=>reject(new Error('Device storage is unavailable.'));
    request.onsuccess=()=>{
      const db=request.result, tx=db.transaction('references',write?'readwrite':'readonly'), store=tx.objectStore('references');
      let rows:Reference[]=[];
      const read=()=>{const all=store.getAll();all.onsuccess=()=>{rows=all.result.map(normalizeReference);};};
      if(write){const get=store.getAll();get.onsuccess=()=>{
        const current=get.result.find((r:Reference)=>r.id===write.id);
        const duplicate=write.starter_key&&get.result.some((r:Reference)=>r.starter_key===write.starter_key&&r.id!==write.id);
        if(duplicate||(current&&current.revision!==write.revision-1)){tx.abort();return;}
        store.put(write);read();
      };}else read();
      tx.oncomplete=()=>{db.close();resolve(rows);};
      tx.onerror=tx.onabort=()=>{db.close();reject(new Error('Reference changed in another tab or could not be saved. Export your changes before reloading.'));};
    };
  });
}
export async function referencePhotoUrl(photo:ReferencePhoto) {
  if(!photo.path)return photo.imageUrl??'';
  const db=getSupabaseBrowserClient();if(!db)throw new Error('Database not connected.');
  const {data,error}=await db.storage.from('reference-images').createSignedUrl(photo.path,3600);
  if(error)throw new Error('A reference photo could not be loaded.');return data.signedUrl;
}
export async function loadReferences(preview:boolean) {
  if(preview)return previewReferences();
  const db=getSupabaseBrowserClient();if(!db)throw new Error('Database not connected.');
  const {data,error}=await db.from('bench_references').select('*').order('updated_at',{ascending:false});
  if(error)throw new Error(error.message);
  return Promise.all((data??[]).map(async row=>{const r=normalizeReference(row);return {...r,photos:await Promise.all(r.photos.map(async p=>({...p,imageUrl:await referencePhotoUrl(p)}))),documents:await Promise.all(r.documents.map(async d=>({...d,url:await referenceDocumentUrl(d)})))};}));
}
export async function prepareReferencePhoto(file:File,referenceId:string,preview:boolean):Promise<ReferencePhoto> {
  const prepared=await prepareImage(file);
  try {
    const id=crypto.randomUUID(),imageUrl=await imageDataUrl(prepared.file);let path='';
    if(!preview){const db=getSupabaseBrowserClient();if(!db)throw new Error('Database not connected.');const {data,error}=await db.auth.getUser();if(error||!data.user)throw new Error('Sign in again.');
      path=`${data.user.id}/${referenceId}/${id}.webp`;
      const upload=await db.storage.from('reference-images').upload(path,prepared.file,{contentType:'image/webp',upsert:false});if(upload.error)throw new Error(upload.error.message);
    }
    return {id,path,caption:'',imageUrl};
  }finally{URL.revokeObjectURL(prepared.previewUrl);}
}
export async function saveReference(editing:Reference,preview:boolean) {
  if(!editing.title.trim()||!editing.body.trim())throw new Error('Add a title and reference notes.');
  if(editing.source_url&&!/^https?:\/\//i.test(editing.source_url))throw new Error('Source links must start with https:// or http://.');
  if(editing.documents.some(d=>!d.name.trim()))throw new Error('Give each PDF a title.');
  const saved={...editing,revision:editing.revision+1,updated_at:new Date().toISOString()};
  if(preview)return previewReferences(saved);
  const db=getSupabaseBrowserClient();if(!db)throw new Error('Database not connected.');
  const {data:user}=await db.auth.getUser();if(!user.user)throw new Error('Sign in again.');
  // Only persisted columns are sent; temporary signed URLs remain in memory.
  const document={id:saved.id,title:saved.title,category:saved.category,subcategory:saved.subcategory.trim(),body:saved.body,source_url:saved.source_url,status:saved.status,starter_key:saved.starter_key,revision:saved.revision,updated_at:saved.updated_at,photos:saved.photos.map(p=>({id:p.id,path:p.path,caption:p.caption})),documents:saved.documents.map(d=>({id:d.id,path:d.path,name:d.name,bytes:d.bytes}))};
  const query=editing.revision===0?db.from('bench_references').insert({...document,owner_id:user.user.id}):db.from('bench_references').update(document).eq('id',saved.id).eq('revision',editing.revision);
  const result=await query.select().single();
  if(result.error)throw new Error('Save failed or this reference changed on another device. Your changes remain open. '+result.error.message);
  return [saved];
}
export async function exportReferences(references:Reference[],unsaved?:Reference|null) {
  const entries:Record<string,Uint8Array>={};let bytes=0;
  async function pack(r:Reference){return {...r,documents:await Promise.all(r.documents.map(async d=>{const response=await fetch(await referenceDocumentUrl(d));if(!response.ok)throw new Error('PDF export failed. No archive was created.');const data=new Uint8Array(await response.arrayBuffer());bytes+=data.length;if(bytes>100*1024*1024)throw new Error('Reference export exceeds 100 MB.');const path=`documents/${r.id}/${d.id}.pdf`;entries[path]=data;return {id:d.id,name:d.name,bytes:d.bytes,path};})),photos:await Promise.all(r.photos.map(async p=>{
    const response=await fetch(await referencePhotoUrl(p));if(!response.ok)throw new Error('Photo export failed. No archive was created.');
    const data=new Uint8Array(await response.arrayBuffer());bytes+=data.length;if(bytes>100*1024*1024)throw new Error('Reference export exceeds 100 MB.');
    const path=`photos/${r.id}/${p.id}.webp`;entries[path]=data;return {id:p.id,caption:p.caption,path};
  }))};}
  // Unsaved edits replace the matching saved version in this portable snapshot.
  const rows=unsaved?[...references.filter(r=>r.id!==unsaved.id),unsaved]:references;
  const records=await Promise.all(rows.map(pack));
  entries['references.json']=strToU8(JSON.stringify({format:'PartsDB bench references',version:2,references:records,unsaved_reference_id:unsaved?.id??null},null,2));
  entries['README.txt']=strToU8('Reference notes, compressed photos and original PDF documents. Paths are relative to this ZIP. Automated import is not implemented.');
  const url=URL.createObjectURL(new Blob([new Uint8Array(zipSync(entries,{level:0}))],{type:'application/zip'}));
  const a=document.createElement('a');a.href=url;a.download='bench-references.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

export async function referenceDocumentUrl(document:ReferenceDocument){
  if(!document.path)return document.url??'';
  const db=getSupabaseBrowserClient();if(!db)throw new Error('Database not connected.');
  const {data,error}=await db.storage.from('reference-documents').createSignedUrl(document.path,3600);
  if(error)throw new Error('A PDF could not be opened.');return data.signedUrl;
}
export async function prepareReferenceDocument(file:File,referenceId:string,preview:boolean):Promise<ReferenceDocument>{
  if(!file.name.toLowerCase().endsWith('.pdf'))throw new Error('Choose a PDF document.');
  if(file.size>20*1024*1024)throw new Error(file.name+' exceeds the 20 MB PDF limit.');
  const header=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());if(header!=='%PDF-')throw new Error(file.name+' is not a valid PDF file.');
  const id=crypto.randomUUID();let path='',url='';
  if(preview)url=await imageDataUrl(file);
  else {const db=getSupabaseBrowserClient();if(!db)throw new Error('Database not connected.');const {data,error}=await db.auth.getUser();if(error||!data.user)throw new Error('Sign in again.');path=`${data.user.id}/${referenceId}/${id}.pdf`;const result=await db.storage.from('reference-documents').upload(path,file,{contentType:'application/pdf',upsert:false});if(result.error)throw new Error(result.error.message);}
  return {id,path,name:file.name,bytes:file.size,url};
}
export async function downloadReferenceDocument(document:ReferenceDocument){
 const response=await fetch(await referenceDocumentUrl(document));if(!response.ok)throw new Error('PDF could not be downloaded.');
 const url=URL.createObjectURL(await response.blob()),a=window.document.createElement('a');a.href=url;a.download=document.name.toLowerCase().endsWith('.pdf')?document.name:document.name+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
