export function narrowOptions<T extends {value:string;label:string}>(options:T[],query:string,selected:string){
 const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const matchesQuery=(option:T)=>terms.every(term=>option.label.toLocaleLowerCase().includes(term));
 const matches=options.filter(option=>option.value!==''&&matchesQuery(option)).length;
 return {
  visible:options.filter(option=>option.value===''||option.value===selected||matchesQuery(option)),
  matches,
  selectionKept:terms.length>0&&options.some(option=>option.value===selected&&option.value!==''&&!matchesQuery(option)),
 };
}
