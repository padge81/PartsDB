import { drawRepairArrow } from './repair-annotations';
import { createWorkshopGuide } from './workshop-guide';
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
    if (mark.kind === 'arrow' || mark.kind === 'double_arrow') drawRepairArrow(ctx,x,y,x2,y2,mark.kind==='double_arrow');
    if (mark.kind === 'number') { const radius = canvas.width*.028; ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill(); ctx.fillStyle = '#102b3f'; ctx.font = `bold ${radius*1.15}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(mark.label ?? '',x,y); ctx.fillStyle = '#ffdb3c'; }
  }
  return canvas;
}
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
const filename = (log: RepairLog) => log.title.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,70) || 'repair-log';
export async function exportRepairPdf(log: RepairLog, preview: boolean) {
  const doc = await createWorkshopGuide(log,preview,async step=>{
    const canvas=await photoCanvas(step);
    return {data:canvas.toDataURL('image/jpeg',.9),width:canvas.width,height:canvas.height};
  });
  doc.save(`${filename(log)}-guide.pdf`);
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
