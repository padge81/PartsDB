import test from 'node:test';
import {matchesRepairWorkflow,repairWorkflowLabel} from '../lib/repair-workflow.ts';
test('legacy approved drafts remain published without changing a single field',()=>{
 const log={id:'existing',status:'draft',publication_status:'approved',owner_id:'me',steps:[{image_path:'keep-photo'}]};const before=structuredClone(log);
 assert.equal(repairWorkflowLabel(log),'Published guide');assert.equal(matchesRepairWorkflow(log,'me','work'),false);
 assert.equal(matchesRepairWorkflow(log,'me','approved'),true);assert.equal(matchesRepairWorkflow(log,'me','mine'),true);assert.deepEqual(log,before);
});
test('workflow lists retain old private completed repairs, returned submissions and update drafts',()=>{
 for(const status of ['draft','completed']){
  for(const publication_status of ['private','returned','pending','approved']){
   const log={owner_id:'me',status,publication_status};
   assert.equal(matchesRepairWorkflow(log,'me','work'),['private','returned'].includes(publication_status));
   assert.equal(matchesRepairWorkflow(log,'me','submissions'),publication_status==='pending');
   assert.equal(matchesRepairWorkflow(log,'other','work'),false);
  }
 }
 assert.equal(repairWorkflowLabel({update_of:'published'}),'Update draft');
 assert.equal(matchesRepairWorkflow({owner_id:'me',update_of:'published'},'me','work','update'),true);
 assert.equal(matchesRepairWorkflow({owner_id:'me'},'me','work','update'),false);
});
import assert from 'node:assert/strict';
import {shouldViewRepair,repairGuideSteps,canEditRepair,repairGuideHref} from '../lib/repair-view.ts';
test('focused guide links encode record identifiers',()=>{
 assert.equal(repairGuideHref('guide/one?edit=true'),'/workshop/guides/guide%2Fone%3Fedit%3Dtrue');
});
test('explicit editor navigation respects ownership and publication permissions',()=>{
 for(const publication_status of ['private','returned','pending','approved']){
  const log={status:'completed',owner_id:'creator',publication_status};
  assert.equal(canEditRepair(log,'creator'),['private','returned'].includes(publication_status));
  assert.equal(canEditRepair(log,'other'),false);
  assert.equal(canEditRepair(log,'admin',true),['pending','returned'].includes(publication_status));
  assert.equal(shouldViewRepair(log,'creator','edit',canEditRepair(log,'creator')), !['private','returned'].includes(publication_status));
 }
});
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
