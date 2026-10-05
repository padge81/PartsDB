/* eslint-disable @next/next/no-img-element */
'use client';
import { useId, useRef, useState, type PointerEvent } from 'react';
import type { Mark, RepairStep } from '../lib/workshop';

export function RepairPhoto({ step, onChange, disabled = false }: { step: RepairStep; onChange: (marks: Mark[]) => void; disabled?: boolean }) {
  const [tool, setTool] = useState<Mark['kind']>('circle');
  const [draft, setDraft] = useState<Mark | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const marker = useId().replaceAll(':', '');
  function point(e: PointerEvent<SVGSVGElement>) { const r = e.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; }
  function down(e: PointerEvent<SVGSVGElement>) { if (disabled) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start.current = point(e); setDraft({ ...start.current, x2: start.current.x, y2: start.current.y, kind: tool, label: String(step.annotations.filter(m => m.kind === 'number').length + 1) }); }
  function move(e: PointerEvent<SVGSVGElement>) { if (!start.current) return; const p = point(e); setDraft(d => d ? { ...d, x2: p.x, y2: p.y } : d); }
  function up(e: PointerEvent<SVGSVGElement>) { if (!start.current || !draft) return; const p = point(e); onChange([...step.annotations, { ...draft, x2: p.x, y2: p.y }]); start.current = null; setDraft(null); }
  const marks = draft ? [...step.annotations, draft] : step.annotations;
  return <div className="repair-photo-editor">
    <div className="repair-photo-stage"><img src={step.imageUrl} alt={step.title || 'Repair step photograph'} draggable={false}/>
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" role="img" aria-label={`${step.annotations.length} photo annotations. Choose a tool and drag on the photo.`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDraft(null); }}>
        <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L8 4 L0 8 Z" fill="#ffdb3c"/></marker></defs>
        {marks.map((m, i) => m.kind === 'circle' ? <ellipse key={i} cx={(m.x + m.x2) * 500} cy={(m.y + m.y2) * 500} rx={Math.max(Math.abs(m.x2-m.x)*500, 25)} ry={Math.max(Math.abs(m.y2-m.y)*500, 25)} fill="none" stroke="#ffdb3c" strokeWidth="3" vectorEffect="non-scaling-stroke"/> : m.kind === 'arrow' ? <line key={i} x1={m.x*1000} y1={m.y*1000} x2={m.x2*1000} y2={m.y2*1000} stroke="#ffdb3c" strokeWidth="3" vectorEffect="non-scaling-stroke" markerEnd={`url(#${marker})`}/> : <g key={i}><circle cx={m.x*1000} cy={m.y*1000} r="28" fill="#ffdb3c"/><text x={m.x*1000} y={m.y*1000+10} textAnchor="middle" fontSize="32" fontWeight="bold" fill="#102b3f">{m.label}</text></g>)}
      </svg>
    </div>
    <div className="photo-tools" aria-label="Photo markup tools">{(['circle','arrow','number'] as const).map(t => <button key={t} type="button" disabled={disabled} aria-pressed={tool === t} className={tool === t ? 'selected' : ''} onClick={() => setTool(t)}>{t === 'circle' ? '◯ Circle' : t === 'arrow' ? '↗ Arrow' : '① Number'}</button>)}<button type="button" disabled={disabled || !step.annotations.length} onClick={() => onChange(step.annotations.slice(0,-1))}>Undo</button><button type="button" disabled={disabled || !step.annotations.length} onClick={() => onChange([])}>Clear marks</button></div>
    <p className="wk-small">Drag to mark a part. Tap to place a number. The unmarked photo stays intact.</p>
  </div>;
}
