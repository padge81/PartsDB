type ViewableRepair={status:string;publication_status?:string;owner_id?:string;update_of?:string|null};
export function shouldViewRepair(log:ViewableRepair,viewerId:string,requestedView:string|null=null){
  if(requestedView==='guide')return true;
  if(log.update_of&&log.publication_status==='private'&&log.owner_id===viewerId)return false;
  return ['pending','approved','returned'].includes(log.publication_status??'private')||log.status==='completed'||!!(log.owner_id&&log.owner_id!==viewerId);
}

export function repairGuideSteps<T extends {title:string;instruction:string;image_path:string;imageUrl?:string}>(steps:T[]){
  return steps.filter(step=>step.title.trim()||step.instruction.trim()||step.image_path||step.imageUrl);
}
