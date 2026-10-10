import {redirect} from 'next/navigation';
import {ModuleLanding} from '../../components/module-landing';
export default async function Page({searchParams}:{searchParams:Promise<{log?:string}>}){
 const params=await searchParams;
 if(params.log)redirect('/workshop/logs?log='+encodeURIComponent(params.log));
 return <ModuleLanding module="workshop"/>;
}
