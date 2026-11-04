import {redirect} from 'next/navigation';
import {Workshop} from '../../../components/workshop';
import {repairGuideHref} from '../../../lib/repair-view';
export default async function Page({searchParams}:{searchParams:Promise<{log?:string;view?:string}>}){
 const params=await searchParams;
 if(params.log&&params.view==='guide')redirect(repairGuideHref(params.log));
 return <Workshop/>;
}
