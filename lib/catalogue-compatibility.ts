import {getSupabaseBrowserClient} from './supabase';
import {expandMachineCompatibility,readAllRows,type MachineLink,type OrderMember} from './machine-compatibility';

export async function loadCatalogueCompatibility(){
  const db=getSupabaseBrowserClient();
  if(!db)return {data:[] as MachineLink[],error:{message:'Database is not configured.'}};
  const [direct,members]=await Promise.all([
    readAllRows<MachineLink>((from,to)=>db.from('part_machines').select('part_id,machine_id').order('part_id').order('machine_id').range(from,to)),
    readAllRows<OrderMember>((from,to)=>db.from('part_order_group_members').select('part_id,group_id').order('part_id').range(from,to)),
  ]);
  if(direct.error||members.error)return {data:[] as MachineLink[],error:direct.error??members.error};
  return {data:expandMachineCompatibility(direct.data,members.data),error:null};
}

export async function loadMachineSearchParts(machineId:string){
  const db=getSupabaseBrowserClient();
  if(!db)return {data:[],error:{message:'Database is not configured.'}};
  const [links,parts]=await Promise.all([
    loadCatalogueCompatibility(),
    readAllRows((from,to)=>db.from('parts').select('id,description,manufacturer_part_number').eq('status','active').order('description').order('id').range(from,to)),
  ]);
  if(links.error||parts.error)return {data:[],error:links.error??parts.error};
  const ids=new Set(links.data.filter(link=>link.machine_id===machineId).map(link=>link.part_id));
  return {data:parts.data.filter(part=>ids.has(part.id)),error:null};
}
