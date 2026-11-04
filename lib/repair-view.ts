type ViewableRepair={status:string;publication_status?:string;owner_id?:string;update_of?:string|null};
export function shouldViewRepair(log:ViewableRepair,viewerId:string,requestedView:string|null=null,canEdit=canEditRepair(log,viewerId)){
  // Reading is the default. Existing drafts are edited only through an explicit action.
  return !(requestedView==='edit'&&canEdit);
}

export function canEditRepair(log:ViewableRepair,viewerId:string,admin=false){
 const publication=log.publication_status??'private';
 const owner=!log.owner_id||log.owner_id===viewerId;
 return publication!=='approved'&&((owner&&['private','returned'].includes(publication))||(admin&&['pending','returned'].includes(publication)));
}
export function repairGuideHref(id:string){return '/workshop/guides/'+encodeURIComponent(id);}

export function repairGuideSteps<T extends {title:string;instruction:string;image_path:string;imageUrl?:string}>(steps:T[]){
  return steps.filter(step=>step.title.trim()||step.instruction.trim()||step.image_path||step.imageUrl);
}
