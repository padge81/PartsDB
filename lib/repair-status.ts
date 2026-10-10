export type RepairStatus='draft'|'completed';
// Retain compatibility with older database rows, device drafts and exports.
export function repairStatus(value:string):RepairStatus{return value==='completed'?'completed':'draft';}
