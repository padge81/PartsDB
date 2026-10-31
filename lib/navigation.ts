export type ModuleId='parts'|'machines'|'workshop'|'calculators';
export const modules=[
 {id:'parts',title:'Parts',description:'Find parts, check compatibility and prepare an order.',href:'/parts/search'},
 {id:'machines',title:'Machines',description:'Find a machine, its compatible parts and shared repair guides.',href:'/machines/search'},
 {id:'workshop',title:'Workshop',description:'Record repairs, build photo guides and keep bench references.',href:'/workshop'},
 {id:'calculators',title:'Calculators',description:'Use practical workshop calculators for measurements and diagnostics.',href:'/calculators'},
] as const;
export const moduleLinks:Record<ModuleId,{title:string;href:string}[]>={
 parts:[{title:'Search parts',href:'/parts/search'},{title:'Add part',href:'/parts/new'},{title:'My requests',href:'/requests'},{title:'Parts list / BOM',href:'/bom'}],
 machines:[{title:'Search machines',href:'/machines/search'}],
 workshop:[{title:'Overview',href:'/workshop'},{title:'Repair logs',href:'/workshop/logs'},{title:'Bench references',href:'/workshop/references'}],
 calculators:[{title:'Overview',href:'/calculators'},{title:'Circumference',href:'/calculators/circumference'}],
};
export function activeModule(path:string):ModuleId|null{
 if(path==='/dashboard'||path==='/bom'||path==='/requests'||path.startsWith('/requests/')||path==='/parts'||path.startsWith('/parts/'))return 'parts';
 if(path==='/machines'||path.startsWith('/machines/'))return 'machines';
 if(path==='/workshop'||path.startsWith('/workshop/'))return 'workshop';
 if(path==='/calculators'||path.startsWith('/calculators/'))return 'calculators';
 return null;
}
export function activeModuleLink(path:string,href:string){
 if(path==='/dashboard')return href==='/parts/search';
 return path===href||(href==='/requests'&&path.startsWith('/requests/'));
}
