import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldViewRepair,repairGuideSteps} from '../lib/repair-view.ts';
test('own drafts stay in the editor; completed and approved records open as guides',()=>{
 assert.equal(shouldViewRepair({status:'draft',owner_id:'me',publication_status:'private'},'me'),false);
 assert.equal(shouldViewRepair({status:'completed',owner_id:'me',publication_status:'private',update_of:'published'},'me'),false);
 assert.equal(shouldViewRepair({status:'completed',owner_id:'me',publication_status:'private'},'me'),true);
 assert.equal(shouldViewRepair({status:'draft',owner_id:'me',publication_status:'approved'},'me'),true);
});
test('view links override editor defaults without changing permissions',()=>{
 assert.equal(shouldViewRepair({status:'draft',owner_id:'me'},'me','guide'),true);
 assert.equal(shouldViewRepair({status:'draft',owner_id:'other',publication_status:'pending'},'me'),true);
});
test('submitted, returned and approved logs open as documents for creators and administrators',()=>{
 for(const publication_status of ['pending','returned','approved']){
  assert.equal(shouldViewRepair({status:'draft',owner_id:'me',publication_status},'me'),true);
  assert.equal(shouldViewRepair({status:'draft',owner_id:'me',publication_status},'admin'),true);
 }
 assert.equal(shouldViewRepair({status:'completed',publication_status:'approved'},'admin','guide'),true);
 assert.equal(shouldViewRepair({status:'draft',owner_id:'me',publication_status:'private'},'me'),false);
});

test('document and PDF steps omit empty entries but retain text-only and missing-photo steps',()=>{
 const make=(id,patch={})=>({id,title:'',instruction:'',image_path:'',...patch});
 const steps=[make('empty'),make('whitespace',{title:'  ',instruction:'\n'}),make('text',{instruction:'Remove cover'}),make('photo',{imageUrl:'photo'}),make('missing',{image_path:'saved/photo.webp'})];
 assert.deepEqual(repairGuideSteps(steps).map(s=>s.id),['text','photo','missing']);
 assert.equal(steps.length,5);
});
