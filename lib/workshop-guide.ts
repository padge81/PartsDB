import { jsPDF } from 'jspdf';
import type { RepairLog, RepairStep } from './workshop';

type Photo = { data: string; width: number; height: number };
type Prepared = { number: number; title: string[]; body: string[]; photo?: Photo; portrait: boolean; minimum: number };
const clean = (s: string) => s.replace(/[\u2010-\u2015]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '?');
const left = 18, width = 174, top = 22, bottom = 272, gap = 8, caption = 5;
const titleLine = 5, bodyLine = 4.5;

/** Measured rows keep photos, captions and ordinary step text on the same page. */
export async function appendGuideSteps(doc: jsPDF, steps: RepairStep[], loadPhoto: (step: RepairStep) => Promise<Photo>, startY: number) {
  steps = steps.filter(step => step.title.trim() || step.instruction.trim() || step.image_path || step.imageUrl);
  let y = startY, index = 0;
  const pending: Prepared[] = [];
  const newPage = () => { doc.addPage(); y = top; };
  function lines(value: string, size: number, bold: boolean, w: number): string[] {
    if (!value.trim()) return [];
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    return doc.splitTextToSize(clean(value), w);
  }
  async function prepare(step: RepairStep, number: number): Promise<Prepared> {
    if (step.image_path && !step.imageUrl) throw new Error('A step photo is unavailable. Reload the repair and try again.');
    const photo = step.imageUrl ? await loadPhoto(step) : undefined;
    const portrait = !!photo && photo.height > photo.width;
    const textWidth = portrait ? 94 : width;
    const title = lines(`Step ${number}${step.title.trim() ? ' - '+step.title : ''}`, 11, true, textWidth);
    const body = lines(step.instruction, 10, false, textWidth);
    const textHeight = title.length * titleLine + (body.length ? 2 + body.length * bodyLine : 0);
    const minimum = (portrait ? Math.max(textHeight, 66 + caption) : textHeight + (photo ? 3 + 50 + caption : 0)) + gap;
    return {number, title, body, photo, portrait, minimum};
  }
  function write(block: string[], x: number, at: number, size: number, bold: boolean, advance: number) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(23,39,53);
    for (const line of block) { doc.text(line,x,at+size*.3528); at += advance; }
    return at;
  }
  function image(item: Prepared, x: number, at: number, maxW: number, maxH: number) {
    const photo = item.photo!;
    const scale = Math.min(maxW/photo.width, maxH/photo.height);
    const w = photo.width*scale, h = photo.height*scale, imageX = x+(maxW-w)/2;
    doc.addImage(photo.data,'JPEG',imageX,at,w,h);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(85,100,112);
    doc.text(`Step ${item.number} - Photo`,imageX+w/2,at+h+3.5,{align:'center'});
  }
  while (index < steps.length || pending.length) {
    while (pending.length < 3 && index < steps.length) pending.push(await prepare(steps[index],++index));
    // Extremely long notes continue in full-size text, never clipped or shrunk to fit.
    if (pending[0].minimum > bottom-top) {
      if (y > top) newPage();
      const item = pending.shift()!;
      for (const [block,size,bold,advance] of [[item.title,11,true,titleLine],[item.body,10,false,bodyLine]] as const) {
        for (const line of block) { if (y+advance > bottom) newPage(); y=write([line],left,y,size,bold,advance); }
        y+=2;
      }
      if (item.photo) { if (y+85 > bottom) newPage(); image(item,left,y,width,80); y+=85; }
      y+=gap; continue;
    }
    let count = 0, needed = 0;
    for (const item of pending) { if (needed+item.minimum > bottom-y) break; needed+=item.minimum; count++; }
    if (!count) { newPage(); continue; }
    const extra = Math.max(0,(bottom-y-needed)/count);
    for (const item of pending.splice(0,count)) {
      const rowHeight = item.minimum + Math.min(extra,40);
      const textX = item.portrait ? left+80 : left;
      let textEnd = write(item.title,textX,y,11,true,titleLine);
      if (item.body.length) textEnd=write(item.body,textX,textEnd+2,10,false,bodyLine);
      if (item.photo) {
        if (item.portrait) image(item,left,y,70,rowHeight-gap-caption);
        else image(item,left,textEnd+3,width,rowHeight-gap-caption-(textEnd-y)-3);
      }
      y += rowHeight;
    }
    if (pending.length || index < steps.length) newPage();
  }
  return y;
}

/** One printable guide, built from the content actually recorded. Empty fields are omitted. */
export async function createWorkshopGuide(log: RepairLog, preview: boolean, loadPhoto: (step: RepairStep) => Promise<Photo>) {
  const doc = new jsPDF({unit:'mm',format:'a4'});
  let y = top;
  const nextPage = () => { doc.addPage(); y = top; };
  function text(value: string, size = 11, bold = false) {
    if (!value.trim()) return;
    doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(23,39,53);
    const lines: string[] = doc.splitTextToSize(clean(value),width);
    for (const line of lines) {
      if (y + size*.45 > bottom) nextPage();
      doc.text(line,left,y); y += size*.45+1;
    }
    y += 3;
  }
  function section(title: string, value: string) {
    if (!value.trim()) return;
    if (y > bottom-25) nextPage();
    text(title,12,true);text(value.trim());y+=3;
  }
  text('Workshop guide',10,true);
  text(log.title,17,true);
  text(`${preview?'DEMONSTRATION / ':''}${log.status==='completed'?'COMPLETED JOB - verify suitability before reuse':'DRAFT - NOT A VERIFIED PROCEDURE'}`,9,true);
  const metadata = [
    log.machine_name.trim() && 'Machine: '+log.machine_name.trim(),
    [log.job_date && 'Date: '+log.job_date,log.technician.trim() && 'Technician: '+log.technician.trim()].filter(Boolean).join(' | '),
  ].filter(Boolean).join('\n');
  text(metadata,9);
  section('Fault / task',log.fault);
  section('Tools and preparation',log.tools);
  if (log.parts.length) section('Parts used',log.parts.map(part=>`${part.quantity} x ${part.description}${part.number?' | '+part.number:''}`).join('\n'));
  y = await appendGuideSteps(doc,log.steps,loadPhoto,y);
  section('Testing and verification',log.tests);
  section('Outcome / outstanding work',log.outcome);
  const total=doc.getNumberOfPages();
  for (let page=1;page<=total;page++) {
    doc.setPage(page);doc.setDrawColor(210,218,224);doc.line(left,279,192,279);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(85,100,112);
    const state=preview?'Preview':log.publication_status==='approved'?'Approved repair record':'Private repair record';
    doc.text('PartsDB Workshop | '+state,left,284);
    doc.text(`${page} / ${total}`,192,284,{align:'right'});
    doc.setFontSize(7);
    doc.text(clean(`Record: ${log.id} | Revision: ${log.revision} | Exported: ${new Date().toLocaleDateString('en-AU')}`),left,290);
  }
  return doc;
}
