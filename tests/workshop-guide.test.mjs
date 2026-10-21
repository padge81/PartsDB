import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { appendGuideSteps, createWorkshopGuide } from '../lib/workshop-guide.ts';

function fixture() {
  const doc=new jsPDF({unit:'mm',format:'a4'}), texts=[], images=[];
  const originalText=doc.text.bind(doc);
  doc.text=(text,x,y,options)=>{texts.push({text,x,y,size:doc.getFontSize(),page:doc.getCurrentPageInfo().pageNumber,options});return originalText(text,x,y,options);};
  doc.addImage=(_data,_format,x,y,w,h)=>{images.push({x,y,w,h,page:doc.getCurrentPageInfo().pageNumber});return doc;};
  return {doc,texts,images};
}
const step=(id,instruction='')=>({id:String(id),title:'Remove cover',instruction,imageUrl:'fixture',image_path:'',annotations:[]});
const portrait=async()=>({data:'fixture',width:600,height:900});
const landscape=async()=>({data:'fixture',width:1200,height:700});

test('six short portrait steps fit three per full page, with text beside each photo',async()=>{
  const {doc,texts,images}=fixture();
  await appendGuideSteps(doc,Array.from({length:6},(_,i)=>step(i)),portrait,22);
  assert.equal(doc.getNumberOfPages(),2);
  assert.deepEqual(images.map(i=>i.page),[1,1,1,2,2,2]);
  assert.ok(texts.filter(t=>t.text.includes('Remove cover')).every(t=>t.x===98));
  assert.ok(!texts.some(t=>t.text.includes('Not recorded')));
  for(let i=0;i<images.length;i++){
    const image=images[i],caption=texts.find(t=>t.text===`Step ${i+1} - Photo`);
    assert.equal(caption.page,image.page);assert.equal(caption.size,8);
    assert.equal(caption.x,image.x+image.w/2);assert.ok(Math.abs(caption.y-image.y-image.h-3.5)<0.001);
    assert.equal(caption.options.align,'center');assert.ok(caption.y<=272);
    assert.ok(Math.abs(image.w/image.h-600/900)<0.001);
  }
});
test('landscape photos follow their instructions and retain aspect ratio',async()=>{
  const {doc,texts,images}=fixture();
  await appendGuideSteps(doc,[step(1,'Disconnect power before removing the cover.'),step(2),step(3)],landscape,22);
  assert.equal(doc.getNumberOfPages(),1);
  assert.ok(texts.find(t=>t.text.includes('Disconnect')).y<images[0].y);
  assert.ok(images.every(i=>Math.abs(i.w/i.h-1200/700)<0.001));
});
test('intro space produces two steps on the first page and continues without losing order',async()=>{
  const {doc,texts,images}=fixture();
  await appendGuideSteps(doc,Array.from({length:5},(_,i)=>step(i)),portrait,90);
  assert.deepEqual(images.map(i=>i.page),[1,1,2,2,2]);
  assert.deepEqual(texts.filter(t=>t.text.endsWith(' - Photo')).map(t=>t.text),Array.from({length:5},(_,i)=>`Step ${i+1} - Photo`));
});
test('long instructions continue across pages without clipping or losing the final words',async()=>{
  const {doc,texts,images}=fixture();
  await appendGuideSteps(doc,[step(1,('Detailed service instruction. '.repeat(700))+'FINAL WORDS')],portrait,90);
  assert.ok(doc.getNumberOfPages()>2);assert.ok(texts.some(t=>t.text.includes('FINAL WORDS')));
  assert.ok(texts.every(t=>t.y<=272));assert.equal(images.length,1);
  assert.ok(doc.output().startsWith('%PDF'));
});
test('text-only steps need no image loading and completely empty steps are skipped',async()=>{
  const {doc,texts,images}=fixture();
  await appendGuideSteps(doc,[{...step(1),imageUrl:undefined,title:'Text-only action',instruction:''},{...step(2),imageUrl:undefined,title:'',instruction:'  '}],async()=>{throw new Error('unexpected image load');},22);
  assert.equal(images.length,0);assert.deepEqual(texts.map(t=>t.text),['Step 1 - Text-only action']);
});

const log=(extra={})=>({
 id:'fixture-record',title:'Fixture repair',machine_id:null,machine_name:'',technician:'',job_date:'',
 fault:'',tools:'',tests:'',outcome:'',status:'draft',revision:3,updated_at:'',parts:[],steps:[],...extra,
});
test('sparse draft exports without unfinished questions, placeholder sections or blank steps',async()=>{
 const doc=await createWorkshopGuide(log({steps:[{...step(1),imageUrl:undefined,title:'  ',instruction:''}]}),false,portrait);
 const pdf=doc.output();
 for(const absent of ['Not recorded','Testing and verification','Outcome / outstanding work','Tools and preparation','Parts used','Machine:','Technician:','Step 1'])assert.ok(!pdf.includes(absent),absent);
 assert.ok(pdf.includes('DRAFT - NOT A VERIFIED PROCEDURE'));
 assert.equal(doc.getNumberOfPages(),1);
});
test('entered fault, preparation, parts, test and outcome are retained in the single guide',async()=>{
 const doc=await createWorkshopGuide(log({fault:'FAULT_MARKER',tools:'TOOLS_MARKER',tests:'TEST_MARKER',outcome:'OUTCOME_MARKER',parts:[{quantity:2,description:'PART_MARKER',number:'ABC-123'}]}),false,portrait);
 for(const marker of ['FAULT_MARKER','TOOLS_MARKER','TEST_MARKER','OUTCOME_MARKER','PART_MARKER','ABC-123'])assert.ok(doc.output().includes(marker),marker);
});
test('photo-only steps survive and empty gaps are renumbered only in the PDF',async()=>{
 const {doc,texts,images}=fixture();
 const steps=[{...step(1),title:'',instruction:''},{...step(2),imageUrl:undefined,title:' ',instruction:''},{...step(3),title:'',instruction:''}];
 await appendGuideSteps(doc,steps,portrait,22);
 assert.equal(images.length,2);
 assert.deepEqual(texts.filter(t=>t.text.endsWith(' - Photo')).map(t=>t.text),['Step 1 - Photo','Step 2 - Photo']);
 assert.equal(steps.length,3);
});
test('missing saved photo fails export instead of silently producing an incomplete guide',async()=>{
 const {doc}=fixture();
 await assert.rejects(appendGuideSteps(doc,[{...step(1),imageUrl:undefined,image_path:'saved/photo.webp'}],portrait,22),/photo is unavailable/);
});
