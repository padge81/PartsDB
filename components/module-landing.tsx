'use client';
import {AppShell} from './app-shell';
import {ArrowIcon,BoxIcon,ClipboardIcon,SearchIcon,ShieldIcon} from './icons';
import {modules,type ModuleId} from '../lib/navigation';
const actions:Record<ModuleId,{title:string;description:string;href:string;editing?:boolean}[]>={
 parts:[
  {title:'Search parts',description:'Look up part numbers, suppliers and machine compatibility.',href:'/parts/search'},
  {title:'Add a part',description:'Record a new part and submit it for approval.',href:'/parts/new',editing:true},
  {title:'My requests',description:'Continue a draft or check the progress of a submission.',href:'/requests'},
  {title:'Parts list / BOM',description:'Gather parts and quantities for a repair or order.',href:'/bom'},
 ],
 machines:[{title:'Search machines',description:'Browse by name, model, manufacturer or category. Open a machine to see its parts and approved repair logs.',href:'/machines/search'}],
 workshop:[
  {title:'Repair logs',description:'Start a repair, continue work or browse approved guides. Edits save automatically.',href:'/workshop/logs'},
  {title:'Bench references',description:'Look up pinouts, connectors, fasteners and datasheets. Organise your own notes and photos.',href:'/workshop/references'},
 ],
};
export function ModuleLanding({module}:{module?:ModuleId}){
 const current=modules.find(item=>item.id===module);
 return <AppShell>{(profile,siteMode)=><main className="workspace hub-workspace">
  <header className="hub-heading"><p className="eyebrow accent">{current?'Your technician workspace':'Parts · Machines · Workshop'}</p><h1>{current?.title??'What are you working on?'}</h1><p>{current?.description??'Your parts catalogue, machine knowledge and repair notebook, in one place.'}</p></header>
  <section className={'hub-grid'+(module?' hub-actions':'')} aria-label={current?current.title+' tools':'Main modules'}>
   {!module?modules.map(item=><a key={item.id} className={'hub-card '+item.id} href={item.href}><span className="hub-icon">{item.id==='parts'?<BoxIcon/>:item.id==='machines'?<SearchIcon/>:<ClipboardIcon/>}</span><h2>{item.title}</h2><p>{item.description}</p><span className="hub-card-action">Open {item.title}<ArrowIcon/></span></a>):actions[module].map(item=>siteMode==='standby'&&item.editing?<article className="hub-card hub-disabled" key={item.href}><span className="hub-icon"><BoxIcon/></span><h2>{item.title}</h2><p>{item.description}</p><span className="hub-card-action">Unavailable in standby</span></article>:<a className={'hub-card '+module} key={item.href} href={item.href}><span className="hub-icon">{module==='workshop'?<ClipboardIcon/>:module==='machines'?<SearchIcon/>:<BoxIcon/>}</span><h2>{item.title}</h2><p>{item.description}</p><span className="hub-card-action">Open<ArrowIcon/></span></a>)}
  </section>
  {profile.role==='admin'&&<aside className="hub-admin"><span><ShieldIcon/><strong>Administration</strong></span><p>{module==='machines'?'Maintain machine details, images and availability.':module==='workshop'?'Review submitted repairs and maintain reference information.':'Review submissions and manage the database.'}</p><a href={module==='machines'?'/admin/machines':module==='workshop'?'/admin/workshop':'/admin'}>Open {module==='machines'?'machine editor':module==='workshop'?'repair approvals':'admin'}<ArrowIcon/></a></aside>}
 </main>}</AppShell>;
}
