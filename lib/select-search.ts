export function matchingOptions<T extends {value:string;label:string}>(options:T[],query:string):T[]{
 const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return options.filter(option=>option.value===''||terms.every(term=>option.label.toLocaleLowerCase().includes(term)));
}
