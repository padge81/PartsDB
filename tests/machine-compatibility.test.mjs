import test from 'node:test';
import assert from 'node:assert/strict';
import {expandMachineCompatibility,readAllRows} from '../lib/machine-compatibility.ts';
const link=(part_id,machine_id)=>({part_id,machine_id});
const member=(part_id,group_id)=>({part_id,group_id});
test('each group member inherits the union of machines without duplicate results',()=>{
  const result=expandMachineCompatibility([link('a','x'),link('a','y'),link('b','x'),link('c','z')],[member('a','g'),member('b','g'),member('d','g')]);
  for(const id of ['a','b','d'])assert.deepEqual(result.filter(r=>r.part_id===id).map(r=>r.machine_id).sort(),['x','y']);
  assert.deepEqual(result.filter(r=>r.part_id==='c'),[link('c','z')]);
});
test('unlinked groups do not match and separate groups do not leak machines',()=>{
  assert.deepEqual(expandMachineCompatibility([link('a','x')],[member('a','one'),member('b','one'),member('c','two'),member('d','two')]),[link('a','x'),link('b','x')]);
});
test('removing membership removes inherited matches but preserves direct compatibility',()=>{
  const direct=[link('a','x'),link('b','y')];
  assert.deepEqual(expandMachineCompatibility(direct,[member('a','g')]),direct);
  assert.deepEqual(direct,[link('a','x'),link('b','y')]);
});
test('all pages are loaded, including a group member past the first 1000',async()=>{
  const rows=Array.from({length:1001},(_,i)=>member(String(i),'g'));
  const result=await readAllRows(async(from,to)=>({data:rows.slice(from,to+1),error:null}));
  assert.equal(result.data.length,1001);
  assert.equal(expandMachineCompatibility([link('1000','machine')],result.data).length,1001);
});
test('a later page failure does not silently return incomplete compatibility',async()=>{
  const result=await readAllRows(async from=>from?{data:null,error:{message:'Failed'}}:{data:Array(1000).fill(link('a','x')),error:null});
  assert.equal(result.error.message,'Failed');assert.deepEqual(result.data,[]);
});
