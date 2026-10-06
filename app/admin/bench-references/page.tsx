'use client';
import { AppShell } from '../../../components/app-shell';
import { BenchReferences } from '../../../components/bench-references';
import '../../../components/workshop.css';

export default function BenchReferenceEditor() {
  return <AppShell requireAdmin>{(_profile,siteMode)=><main className="wk-workspace"><div className="wk-heading"><div><p className="wk-eyebrow">DATABASE MANAGEMENT</p><h1>Bench reference editor</h1><p>Edit your reference notes, categories and photos. Saved changes also appear in Workshop.</p></div><a className="button secondary" href="/admin#database-management">Back to database management</a></div><BenchReferences preview={false} readonly={siteMode==='standby'}/></main>}</AppShell>;
}
