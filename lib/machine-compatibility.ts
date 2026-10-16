export type MachineLink={part_id:string;machine_id:string};
export type OrderMember={part_id:string;group_id:string};

// Ordering groups are disjoint: each part belongs to at most one group.
export function expandMachineCompatibility(direct:MachineLink[],members:OrderMember[]):MachineLink[]{
  const byPart=new Map<string,Set<string>>();
  for(const link of direct){
    if(!byPart.has(link.part_id))byPart.set(link.part_id,new Set());
    byPart.get(link.part_id)!.add(link.machine_id);
  }
  const groupMachines=new Map<string,Set<string>>();
  for(const member of members){
    if(!groupMachines.has(member.group_id))groupMachines.set(member.group_id,new Set());
    for(const machine of byPart.get(member.part_id)??[])groupMachines.get(member.group_id)!.add(machine);
  }
  for(const member of members){
    if(!byPart.has(member.part_id))byPart.set(member.part_id,new Set());
    for(const machine of groupMachines.get(member.group_id)??[])byPart.get(member.part_id)!.add(machine);
  }
  return [...byPart].flatMap(([part_id,machines])=>[...machines].map(machine_id=>({part_id,machine_id})));
}

export async function readAllRows<T>(page:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>){
  const data:T[]=[];
  for(let from=0;;from+=1000){
    const result=await page(from,from+999);
    if(result.error)return {data:[] as T[],error:result.error};
    data.push(...(result.data??[]));
    if(!result.data||result.data.length<1000)return {data,error:null};
  }
}
