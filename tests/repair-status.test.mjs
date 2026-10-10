import test from 'node:test';
import assert from 'node:assert/strict';
import {repairStatus} from '../lib/repair-status.ts';
test('older in-progress records stay visible as drafts without marking them complete',()=>{
 assert.equal(repairStatus('in_progress'),'draft');
 assert.equal(repairStatus('draft'),'draft');
 assert.equal(repairStatus('completed'),'completed');
});
