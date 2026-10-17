import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldViewRepair} from '../lib/repair-view.ts';
test('own drafts stay in the editor; completed and approved records open as guides',()=>{
 assert.equal(shouldViewRepair({status:'draft',owner_id:'me',publication_status:'private'},'me'),false);
 assert.equal(shouldViewRepair({status:'completed',owner_id:'me',publication_status:'private'},'me'),true);
 assert.equal(shouldViewRepair({status:'draft',owner_id:'me',publication_status:'approved'},'me'),true);
});
test('view links override editor defaults without changing permissions',()=>{
 assert.equal(shouldViewRepair({status:'draft',owner_id:'me'},'me',false,'guide'),true);
 assert.equal(shouldViewRepair({status:'draft',owner_id:'other',publication_status:'pending'},'me'),true);
});
test('admin review keeps the editor unless explicitly opening a guide',()=>{
 assert.equal(shouldViewRepair({status:'draft',publication_status:'pending'},'admin',true),false);
 assert.equal(shouldViewRepair({status:'completed',publication_status:'approved'},'admin',true,'guide'),true);
});
