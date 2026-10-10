'use client';
import {AppShell} from './app-shell';
import {BenchReferences} from './bench-references';
import './workshop.css';
export function ReferenceLibrary(){return <AppShell>{(_,siteMode)=><main className="wk-workspace"><header className="wk-heading"><div><p className="wk-eyebrow">Workshop</p><h1>Bench references</h1><p>Pinouts, components, datasheets and the notes you reach for at the bench.</p></div></header><BenchReferences preview={false} readonly={siteMode==='standby'}/></main>}</AppShell>;}
