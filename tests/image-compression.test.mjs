import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareImage,prepareImages} from '../lib/image-compression.ts';
globalThis.createImageBitmap=async()=>{};
globalThis.document={createElement(){}};

test('batch compression is sequential and releases prior previews on failure',async t=>{
 let active=0,max=0,closed=0;
 const revoked=[];
 t.mock.method(URL,'createObjectURL',()=> 'blob:prepared');
 t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
 t.mock.method(globalThis,'createImageBitmap',async file=>{
   if(file.name==='bad.png') throw new Error('Invalid image');
   active++;max=Math.max(max,active);
   return {width:3200,height:1600,close(){closed++;active--;}};
 });
 t.mock.method(globalThis.document,'createElement',()=>({
   getContext(){return {drawImage(){}};},
   toBlob(done){setTimeout(()=>done(new Blob(['photo'],{type:'image/webp'})),1);},
 }));
 const good=new File(['photo'],'good.png',{type:'image/png'});
 await assert.rejects(prepareImages([good,good,new File(['bad'],'bad.png',{type:'image/png'})]),/Invalid image/);
 assert.equal(max,1);
 assert.equal(closed,2);
 assert.deepEqual(revoked,['blob:prepared','blob:prepared']);
});
test('bitmap is closed when canvas context fails',async t=>{
 let closed=false;
 t.mock.method(globalThis,'createImageBitmap',async()=>({width:10,height:10,close(){closed=true;}}));
 t.mock.method(globalThis.document,'createElement',()=>({getContext(){return null;}}));
 await assert.rejects(prepareImage(new File(['image'],'photo.png',{type:'image/png'})),/Could not process/);
 assert.equal(closed,true);
});
test('empty MIME type accepts known photo extensions but rejects unrelated files',async t=>{
 t.mock.method(globalThis,'createImageBitmap',async()=>{throw new Error('Decoder reached');});
 await assert.rejects(prepareImage(new File(['image'],'photo.jxl')),/Decoder reached/);
 await assert.rejects(prepareImage(new File(['text'],'notes.txt')),/not an image/);
});
