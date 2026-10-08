import { jsPDF } from 'jspdf';
import { appendGuideSteps } from './workshop-guide';
import { strToU8, zipSync } from 'fflate';
import type { RepairLog, RepairStep } from './workshop';

async function photoCanvas(step: RepairStep) {
  const response = await fetch(step.imageUrl!); if (!response.ok) throw new Error('Could not load a photo for export. Reload the log and try again.');
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
  ctx.strokeStyle = '#ffdb3c'; ctx.fillStyle = '#ffdb3c'; ctx.lineWidth = Math.max(4, canvas.width / 220);
  for (const mark of step.annotations) {
    const x = mark.x*canvas.width, y = mark.y*canvas.height, x2 = mark.x2*canvas.width, y2 = mark.y2*canvas.height;
    ctx.beginPath();
    if (mark.kind === 'circle') { ctx.ellipse((x+x2)/2, (y+y2)/2, Math.max(Math.abs(x2-x)/2,canvas.width*.025), Math.max(Math.abs(y2-y)/2,canvas.height*.025), 0, 0, Math.PI*2); ctx.stroke(); }
    if (mark.kind === 'arrow') { ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke(); const angle = Math.atan2(y2-y,x2-x), length = ctx.lineWidth*5; ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-length*Math.cos(angle-.45), y2-length*Math.sin(angle-.45)); ctx.lineTo(x2-length*Math.cos(angle+.45), y2-length*Math.sin(angle+.45)); ctx.closePath(); ctx.fill(); }
    if (mark.kind === 'number') { const radius = canvas.width*.028; ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill(); ctx.fillStyle = '#102b3f'; ctx.font = `bold ${radius*1.15}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(mark.label ?? '',x,y); ctx.fillStyle = '#ffdb3c'; }
  }
  return canvas;
}
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
const filename = (log: RepairLog) => log.title.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,70) || 'repair-log';
const printable = (s: string) => s.replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g,'?');

export async function exportRepairPdf(log: RepairLog, mode: 'report' | 'guide', preview: boolean) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }); let y = 22;
  const width = 174; const bottom = 272;
  const nextPage = () => { doc.addPage(); y = 22; };
  function text(value: string, size = 11, bold = false) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(23,39,53);
    if (mode === 'guide' && !value.trim()) return;
    const lines: string[] = doc.splitTextToSize(printable(value || 'Not recorded'), width);
    for (const line of lines) { if (y + size*.45 > bottom) nextPage(); doc.text(line,18,y); y += size*.45 + 1; }
    y += 3;
  }
  function section(title: string, value: string) { if (mode === 'guide' && !value.trim()) return; if (y > bottom-25) nextPage(); text(title,12,true); text(value); y += 3; }
  if (mode === 'report') text('PARTSDB / WORKSHOP',10,true);
  text(mode === 'report' ? 'Repair report' : 'Workshop guide',mode === 'guide' ? 10 : 24,true);
  text(log.title,17,true);
  text(`${preview ? 'DEMONSTRATION / ' : ''}${log.status === 'completed' ? 'COMPLETED JOB - verify suitability before reuse' : 'DRAFT - NOT A VERIFIED PROCEDURE'}`,10,true);
  if (mode === 'guide') text(`Machine: ${log.machine_name || ''}\nDate: ${log.job_date} | Technician: ${log.technician || ''}\nRecord: ${log.id}\nRevision: ${log.revision} | Exported: ${new Date().toLocaleDateString('en-AU')}`,9);
  else text(`Machine: ${log.machine_name || 'Not recorded'}\nDate: ${log.job_date}\nTechnician: ${log.technician || 'Not recorded'}\nRecord: ${log.id}\nSaved revision: ${log.revision} | Exported: ${new Date().toLocaleDateString('en-AU')}`,10);

  if (mode === 'report') section('Reported fault / task',log.fault);
  section('Tools and preparation',log.tools);
  if (log.parts.length) section('Parts used',log.parts.map(p=>`${p.quantity} x ${p.description}${p.number ? ' | '+p.number : ''}`).join('\n'));
  else if (mode === 'report') section('Parts used','No parts linked.');
  if (mode === 'guide') {
    y = await appendGuideSteps(doc,log.steps,async step => {
      const canvas = await photoCanvas(step);
      return {data:canvas.toDataURL('image/jpeg',.9),width:canvas.width,height:canvas.height};
    },y);
  } else for (let i=0;i<log.steps.length;i++) {
    const step = log.steps[i]; if (y > bottom-55) nextPage();
    text(`${i+1}. ${step.title || 'Untitled step'}`,14,true);
    text(step.instruction);
    if (step.imageUrl) {
      const canvas = await photoCanvas(step);
      const h = Math.min(135,width*canvas.height/canvas.width), w = h*canvas.width/canvas.height;
      if (y+h > bottom) { nextPage(); text(`Step ${i+1} - photo`,11,true); }
      doc.addImage(canvas.toDataURL('image/jpeg',.9),'JPEG',18+(width-w)/2,y,w,h); y += h+8;
    }
  }
  section('Testing and verification',log.tests);
  if (mode === 'report') section('Outcome / outstanding work',log.outcome);
  const total = doc.getNumberOfPages();
  for (let page=1;page<=total;page++) { doc.setPage(page); doc.setDrawColor(210,218,224); doc.line(18,279,192,279); doc.setFontSize(9); doc.setTextColor(85,100,112); doc.text('PartsDB Workshop | '+(preview ? 'Preview' : 'Private repair record'),18,286); doc.text(`${page} / ${total}`,192,286,{align:'right'}); }
  doc.save(`${filename(log)}-${mode}.pdf`);
}
export async function exportRepairArchive(logs: RepairLog[]) {
  const entries: Record<string,Uint8Array> = {}; let bytes = 0;
  const records = [];
  for (const log of logs) {
    const steps = [];
    for (const step of log.steps) {
      const { imageUrl, ...saved } = step;
      if (imageUrl) { const response = await fetch(imageUrl); if (!response.ok) throw new Error('A photo could not be downloaded; archive was not created.'); const image = new Uint8Array(await response.arrayBuffer()); bytes += image.length; if(bytes>100*1024*1024) throw new Error('Export exceeds 100 MB. Export individual jobs instead.'); const path = `photos/${log.id}/${step.id}.webp`; entries[path] = image; saved.image_path = path; }
      steps.push(saved);
    }
    records.push({...log,steps});
  }
  entries['repair-logs.json'] = strToU8(JSON.stringify({format:'PartsDB workshop archive',version:1,exported_at:new Date().toISOString(),logs:records},null,2));
  entries['README.txt'] = strToU8('PartsDB Workshop archive v1\nContains repair records, editable annotations and compressed unmarked photos.\nImage paths are relative to this archive. This is a portable export; automated restore is not yet implemented.\n');
  download(new Blob([new Uint8Array(zipSync(entries,{level:0}))],{type:'application/zip'}),'partsdb-workshop.zip');
}
