type RequestMachine={machine_name?:string|null;machine_model?:string|null;machine_ids?:string[]|null};
export function requestMachineLabel(request:RequestMachine):string{
 const name=request.machine_name?.trim(),model=request.machine_model?.trim();
 if(name)return name;
 if(model)return model;
 const count=new Set((request.machine_ids??[]).filter(Boolean)).size;
 return count?count+' compatible machine'+(count===1?'':'s')+' selected':'No machine specified';
}
