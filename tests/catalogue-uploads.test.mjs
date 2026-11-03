import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createPartRequestSubmission, saveMachineImage} from '../lib/catalogue-uploads.ts';

// Use the real Supabase client with isolated HTTP responses, including failures
// after a write commits (a lost acknowledgement).
function fixture() {
  const tables = {part_requests: [], request_images: [], machine_images: [{id:'old-link',machine_id:'machine',storage_path:'machine/original.webp'}]};
  const objects = new Set(['machine-images/machine/original.webp']), requests = [];
  let fault;
  const respond = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}});
  const client = createClient('https://fixture.invalid', 'test-key', {auth:{persistSession:false,autoRefreshToken:false},global:{fetch: async (input, init={}) => {
    const url = new URL(String(input)), method=init.method??'GET';
    const call={url,method,body:typeof init.body==='string'?JSON.parse(init.body):init.body};
    requests.push(call);
    const fail=fault?.when(call)?fault:null;
    if(fail)fault=null;
    const failure=()=>respond({message:'Injected failure',error:'Injected failure',statusCode:'503',code:'XX001'},503);
    if(fail&&!fail.after)return failure();
    let result;
    if(url.pathname.startsWith('/storage/v1/object')){
      if(method==='POST'){
        const key=decodeURIComponent(url.pathname.split('/object/')[1]);
        if(objects.has(key))return respond({statusCode:'409',error:'Duplicate',message:'The resource already exists'},400);
        objects.add(key); result=respond({Key:key,Id:'object-id'});
      }else if(method==='DELETE'){
        const bucket=url.pathname.split('/').at(-1);
        for(const path of call.body.prefixes)objects.delete(`${bucket}/${path}`);
        result=respond([]);
      }else throw Error('Unexpected storage method '+method);
    }else{
      const table=url.pathname.split('/').at(-1), rows=tables[table];
      if(!rows)throw Error('Unexpected table '+table);
      const matches=row=>[...url.searchParams].every(([key,value])=>!value.startsWith('eq.')||String(row[key])===value.slice(3));
      let selected;
      if(method==='GET')selected=rows.filter(matches);
      else if(method==='DELETE') {selected=rows.filter(matches);tables[table]=rows.filter(row=>!matches(row));}
      else if(method==='PATCH') {selected=rows.filter(matches);for(const row of selected)Object.assign(row,call.body);}
      else if(method==='POST'){
        const payload={id:crypto.randomUUID(),...call.body}, conflict=url.searchParams.get('on_conflict');
        const current=conflict?rows.find(row=>row[conflict]===payload[conflict]):null;
        if(current){Object.assign(current,call.body);selected=[current];}
        else {rows.push(payload);selected=[payload];}
      }else throw Error('Unexpected database method '+method);
      const headers=new Headers(init.headers);
      result=respond(headers.get('Accept')?.includes('vnd.pgrst.object')?selected[0]:selected);
    }
    return fail?.after?failure():result;
  }}});
  return {client,tables,objects,requests,fail(when,after=false){fault={when,after};}};
}
const photo=name=>new File(['photo bytes'],name,{type:'image/webp'});
const upload=bucket=>call=>call.method==='POST'&&call.url.pathname.includes(`/object/${bucket}/`);
const write=table=>call=>call.method==='POST'&&call.url.pathname.endsWith('/'+table);

test('machine replacement retains original if upload fails',async()=>{
  const f=fixture();f.fail(upload('machine-images'));
  await assert.rejects(saveMachineImage(f.client,'machine',photo('new.webp'),false),/Injected/);
  assert.equal(f.tables.machine_images[0].storage_path,'machine/original.webp');
  assert.ok(f.objects.has('machine-images/machine/original.webp'));
});
test('machine replacement retains original if linking fails',async()=>{
  const f=fixture();f.fail(write('machine_images'));
  await assert.rejects(saveMachineImage(f.client,'machine',photo('new.webp'),false),/Injected/);
  assert.ok(f.objects.has('machine-images/machine/original.webp'));
  assert.equal(f.tables.machine_images[0].storage_path,'machine/original.webp');
});
test('lost machine link acknowledgement never deletes the committed replacement',async()=>{
  const f=fixture();f.fail(write('machine_images'),true);
  await assert.rejects(saveMachineImage(f.client,'machine',photo('new.webp'),false),/Injected/);
  assert.ok(f.objects.has('machine-images/'+f.tables.machine_images[0].storage_path));
  await saveMachineImage(f.client,'machine',photo('retry.webp'),false);
  assert.equal(f.tables.machine_images.length,1);
  assert.ok(f.objects.has('machine-images/'+f.tables.machine_images[0].storage_path));
});
test('successful replacement switches link before removing original',async()=>{
  const f=fixture();await saveMachineImage(f.client,'machine',photo('new.webp'),false);
  assert.equal(f.tables.machine_images.length,1);
  assert.ok(!f.objects.has('machine-images/machine/original.webp'));
  assert.ok(f.objects.has('machine-images/'+f.tables.machine_images[0].storage_path));
  assert.ok(f.requests.findIndex(c=>c.method==='DELETE'&&c.url.pathname.includes('/storage/'))>f.requests.findIndex(write('machine_images')));
});
test('failed request photo retains draft and retry reuses the same request',async()=>{
  const f=fixture(), attempt=createPartRequestSubmission(f.client,'owner'), files=[photo('first.webp'),photo('second.webp')];
  f.fail(upload('request-images'));
  await assert.rejects(attempt.submit({part_description:'Bearing'},files),/Injected/);
  assert.equal(f.tables.part_requests[0].status,'draft');
  await attempt.submit({part_description:'Bearing updated'},files);
  assert.equal(f.tables.part_requests.length,1);
  assert.equal(f.tables.part_requests[0].status,'pending');
  assert.equal(f.tables.part_requests[0].part_description,'Bearing updated');
  assert.equal(f.tables.request_images.length,2);
});
test('failed request photo link retries an existing object without duplicate photos',async()=>{
  const f=fixture(), attempt=createPartRequestSubmission(f.client,'owner'), files=[photo('first.webp')];
  f.fail(write('request_images'));
  await assert.rejects(attempt.submit({part_description:'Bearing'},files),/Injected/);
  assert.equal(f.tables.part_requests[0].status,'draft');
  await attempt.submit({part_description:'Bearing'},files);
  assert.equal(f.tables.request_images.length,1);
  assert.equal(f.tables.part_requests[0].status,'pending');
});
test('lost request image acknowledgement reconciles the committed link on retry',async()=>{
  const f=fixture(), attempt=createPartRequestSubmission(f.client,'owner'), files=[photo('first.webp')];
  f.fail(write('request_images'),true);
  await assert.rejects(attempt.submit({part_description:'Bearing'},files),/Injected/);
  await attempt.submit({part_description:'Bearing'},files);
  assert.equal(f.tables.request_images.length,1);
  assert.equal(f.requests.filter(upload('request-images')).length,1);
});
test('lost request creation acknowledgement reuses the draft ID',async()=>{
  const f=fixture(), attempt=createPartRequestSubmission(f.client,'owner');f.fail(write('part_requests'),true);
  await assert.rejects(attempt.submit({part_description:'Bearing'},[]),/Injected/);
  await attempt.submit({part_description:'Bearing'},[]);
  assert.equal(f.tables.part_requests.length,1);
  assert.equal(f.tables.part_requests[0].status,'pending');
});
test('lost submission acknowledgement does not create or upload anything again',async()=>{
  const f=fixture(), attempt=createPartRequestSubmission(f.client,'owner'), files=[photo('first.webp')];
  f.fail(call=>call.method==='PATCH'&&call.body.status==='pending',true);
  await assert.rejects(attempt.submit({part_description:'Bearing'},files),/Injected/);
  await attempt.submit({part_description:'Bearing'},files);
  assert.equal(f.tables.part_requests.length,1);
  assert.equal(f.tables.request_images.length,1);
  assert.equal(f.requests.filter(upload('request-images')).length,1);
});
test('retry reconciles photos removed or reordered after a partial save',async()=>{
  const f=fixture(), attempt=createPartRequestSubmission(f.client,'owner'), files=[photo('first.webp'),photo('second.webp')];
  let count=0;f.fail(call=>write('request_images')(call)&&++count===2);
  await assert.rejects(attempt.submit({part_description:'Bearing'},files),/Injected/);
  await attempt.submit({part_description:'Bearing'},[files[1]]);
  assert.equal(f.tables.request_images.length,1);
  assert.equal(f.tables.request_images[0].sort_order,0);
});
