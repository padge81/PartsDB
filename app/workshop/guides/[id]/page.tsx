import {RepairGuideViewer} from '../../../../components/repair-guide-viewer';

export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <RepairGuideViewer guideId={id}/>;
}
