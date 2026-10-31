'use client';

import {useState} from 'react';
import {AppShell} from './app-shell';
import {calculateCircle,circleUnits,convertMeasurement,formatMeasurement,type CircleField,type CircleUnit} from '../lib/circumference';

const emptyValues:Record<CircleField,string>={radius:'',diameter:'',circumference:''};
const fieldLabels:Record<CircleField,string>={radius:'Radius',diameter:'Diameter',circumference:'Circumference'};

export function CircumferenceCalculator(){
 const [unit,setUnit]=useState<CircleUnit>('mm');
 const [source,setSource]=useState<CircleField>('diameter');
 const [values,setValues]=useState(emptyValues);
 const [error,setError]=useState('');

 function edit(field:CircleField,raw:string){
  setSource(field);
  if(raw.trim()===''){setValues(emptyValues);setError('');return;}
  const numeric=Number(raw);
  if(!Number.isFinite(numeric)||numeric<=0){
   setValues({...emptyValues,[field]:raw});
   setError('Enter a measurement greater than zero.');
   return;
  }
  const result=calculateCircle(field,numeric);
  setValues({
   radius:field==='radius'?raw:formatMeasurement(result.radius),
   diameter:field==='diameter'?raw:formatMeasurement(result.diameter),
   circumference:field==='circumference'?raw:formatMeasurement(result.circumference),
  });
  setError('');
 }

 function changeUnit(next:CircleUnit){
  const numeric=Number(values[source]);
  if(Number.isFinite(numeric)&&numeric>0){
   const converted=convertMeasurement(numeric,unit,next);
   const result=calculateCircle(source,converted);
   setValues({
    radius:formatMeasurement(result.radius),
    diameter:formatMeasurement(result.diameter),
    circumference:formatMeasurement(result.circumference),
   });
  }
  setUnit(next);
 }

 function clear(){
  setValues(emptyValues);
  setError('');
  setSource('diameter');
 }

 return <AppShell>{()=> <main className="workspace calculator-workspace">
  <a className="back-link" href="/calculators">← Back to calculators</a>
  <header className="workspace-heading calculator-heading"><div><p className="eyebrow accent">CALCULATORS</p><h1>Circumference calculator</h1><p>Enter the radius, diameter or circumference of a circle. The other measurements update automatically.</p></div><div className="calculator-mark" aria-hidden="true">π</div></header>
  <section className="calculator-card">
   <div className="calculator-toolbar">
    <label>Measurement unit<select value={unit} onChange={event=>changeUnit(event.target.value as CircleUnit)}>{circleUnits.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <button type="button" className="button secondary" onClick={clear} disabled={!values.radius&&!values.diameter&&!values.circumference}>Clear</button>
   </div>
   <div className="circle-calculator-layout">
    <div className="circle-fields">
     {(Object.keys(fieldLabels) as CircleField[]).map(field=><label key={field} className={source===field&&values[field]?'source-field':''}><span>{fieldLabels[field]}{source===field&&values[field]&&<small>Entered value</small>}</span><div className="measurement-input"><input type="number" inputMode="decimal" min="0" step="any" value={values[field]} onChange={event=>edit(field,event.target.value)} placeholder="0" aria-invalid={Boolean(error&&source===field)} aria-describedby={error&&source===field?'circle-error':undefined}/><span>{unit}</span></div></label>)}
     {error&&<p id="circle-error" className="calculator-error" role="alert">{error}</p>}
    </div>
    <div className="circle-visual" aria-hidden="true"><div className="circle-diagram"><div className="circle-shape"><span className="radius-line">R</span></div><span className="diameter-extension left"/><span className="diameter-extension right"/><div className="diameter-dimension"><span>D</span></div></div><p>C = 2πR = πD</p></div>
   </div>
   <div className="calculator-note" aria-live="polite"><strong>{values[source]&&!error?fieldLabels[source]+' is driving this calculation':'Enter any one measurement'}</strong><span>Results display to three decimal places while calculations retain full precision.</span></div>
  </section>
 </main>}</AppShell>;
}
