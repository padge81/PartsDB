import test from 'node:test';
import assert from 'node:assert/strict';
import {createRepairAutosave} from '../lib/repair-autosave.ts';

const job=(id='repair')=>({id,title:'Initial',revision:0,updated_at:'',owner_id:'owner',publication_status:'private',steps:[],parts:[]});
function gate(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function fixture(persist){
  let local=null;const operations=[],saved=[];
  const saver=createRepairAutosave({
    persist,
    backup:async log=>{local=structuredClone(log);operations.push('backup:'+log.title);},
    clear:async()=>{local=null;operations.push('clear');},
    onSaved:log=>saved.push(log),
  });
  return {saver,operations,saved,local:()=>local};
}
test('new repair is recoverable before its first server save',async()=>{
  const f=fixture(async log=>({...log,revision:1}));
  f.saver.open(job(),true);await f.saver.backup();
  assert.equal(f.local().id,'repair');assert.equal(f.saver.getState().deviceSaved,true);
  await f.saver.flush();assert.equal(f.local(),null);assert.equal(f.saver.getState().dirty,false);
});
test('overlapping save requests share one in-flight save',async()=>{
  const entered=gate(),release=gate();let calls=0;
  const f=fixture(async log=>{calls++;entered.resolve();await release.promise;return {...log,revision:1};});
  f.saver.open(job(),true);const first=f.saver.flush();await entered.promise;
  const second=f.saver.flush();assert.equal(first,second);release.resolve();await second;assert.equal(calls,1);
});
test('typing during a save retains newer content and uses the acknowledged revision',async()=>{
  const entered=gate(),release=gate(),requests=[];
  const f=fixture(async log=>{requests.push(structuredClone(log));if(requests.length===1){entered.resolve();await release.promise;}return {...log,revision:log.revision+1,updated_at:'saved'};});
  f.saver.open(job(),true);const saving=f.saver.flush();await entered.promise;
  f.saver.edit({title:'Newer typing',steps:[{id:'new-step',instruction:'Keep this'}]});
  release.resolve();await saving;
  assert.deepEqual(requests.map(r=>[r.title,r.revision]),[['Initial',0],['Newer typing',1]]);
  assert.equal(f.saver.getState().job.title,'Newer typing');assert.equal(f.saver.getState().job.steps[0].instruction,'Keep this');assert.equal(f.saver.getState().job.revision,2);assert.equal(f.local(),null);
});
test('failed save retains recovery and retries without changing the expected revision',async()=>{
  let fail=true;const requests=[];
  const f=fixture(async log=>{requests.push(log.revision);if(fail)throw new Error('Offline');return {...log,revision:1};});
  f.saver.open(job(),true);await assert.rejects(f.saver.flush(),/Offline/);
  assert.equal(f.local().title,'Initial');assert.equal(f.saver.getState().dirty,true);assert.equal(f.saver.getState().deviceSaved,true);
  fail=false;await f.saver.flush();assert.deepEqual(requests,[0,0]);assert.equal(f.local(),null);
});
test('export flush waits for the latest content before giving the exporter a saved record',async()=>{
  const entered=gate(),release=gate();const f=fixture(async log=>{entered.resolve();await release.promise;return {...log,revision:3};});
  f.saver.open({...job(),revision:2});f.saver.edit({title:'Export this edit'});
  let exported=false;const exporting=f.saver.flush().then(log=>{assert.equal(log.title,'Export this edit');assert.equal(log.revision,3);exported=true;});
  await entered.promise;assert.equal(exported,false);release.resolve();await exporting;assert.equal(exported,true);
});
test('device storage failure does not prevent a successful cloud save',async()=>{
  const saver=createRepairAutosave({persist:async log=>({...log,revision:1}),backup:async()=>{throw new Error('Full');},clear:async()=>{}});
  saver.open(job(),true);await saver.flush();assert.equal(saver.getState().dirty,false);assert.equal(saver.getState().job.revision,1);
});
test('a revision conflict is surfaced and the recovery copy remains intact',async()=>{
  const f=fixture(async()=>{throw new Error('This repair changed on another device.');});
  f.saver.open({...job(),revision:4},true);await assert.rejects(f.saver.flush(),/changed on another device/);
  assert.equal(f.local().revision,4);assert.equal(f.saver.getState().error,'This repair changed on another device.');
});
test('switching records is rejected during an unfinished save',async()=>{
  const entered=gate(),release=gate();const f=fixture(async log=>{entered.resolve();await release.promise;return {...log,revision:1};});
  f.saver.open(job(),true);const pending=f.saver.flush();await entered.promise;
  assert.throws(()=>f.saver.open(job('other')),/Wait for the current save/);
  release.resolve();await pending;f.saver.open(job('other'));assert.equal(f.saver.getState().job.id,'other');
});
test('late backup writes are serialized before cleanup and cannot resurrect an old draft',async()=>{
  const release=gate(),entered=gate();let local=null,calls=0;
  const saver=createRepairAutosave({persist:async log=>({...log,revision:1}),backup:async log=>{if(++calls===1){entered.resolve();await release.promise;}local=log.title;},clear:async()=>{local=null;}});
  saver.open(job(),true);await entered.promise;saver.edit({title:'Latest'});const pending=saver.flush();release.resolve();await pending;
  assert.equal(local,null);assert.equal(saver.getState().job.title,'Latest');assert.equal(saver.getState().dirty,false);
});
