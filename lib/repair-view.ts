type ViewableRepair={status:string;publication_status?:string;owner_id?:string};
export function shouldViewRepair(log:ViewableRepair,viewerId:string,reviewMode=false,requestedView:string|null=null){
  if(requestedView==='guide')return true;
  if(reviewMode)return false;
  return log.publication_status==='approved'||log.status==='completed'||!!(log.owner_id&&log.owner_id!==viewerId);
}
