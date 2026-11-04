import type {RepairLog} from './workshop';
type WorkflowRepair=Pick<RepairLog,'owner_id'|'publication_status'|'update_of'>;
export function repairWorkflowLabel(log:WorkflowRepair){
 switch(log.publication_status??'private'){
  case 'approved':return 'Published guide';
  case 'pending':return 'Awaiting approval';
  case 'returned':return 'Changes requested';
  default:return log.update_of?'Update draft':'Draft';
 }
}
export function matchesRepairWorkflow(log:WorkflowRepair,viewerId:string,scope:string,stage='all'){
 const publication=log.publication_status??'private',own=log.owner_id===viewerId;
 const inScope=scope==='all'||(scope==='work'?own&&['private','returned'].includes(publication):scope==='submissions'?own&&publication==='pending':scope==='mine'?own:publication===scope);
 return inScope&&(stage==='all'||(stage==='update'?publication==='private'&&!!log.update_of:publication===stage));
}
