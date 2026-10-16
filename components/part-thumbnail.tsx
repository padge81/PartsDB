"use client";
import Image from "next/image";
import {createPortal} from "react-dom";
import {useEffect,useRef,useState} from "react";
import {BoxIcon} from "./icons";
import {getSupabaseBrowserClient} from "../lib/supabase";

export type PartThumbnailImage={id:string;storage_path:string;caption:string|null;sort_order:number};
export function PartThumbnail({images,description}:{images?:PartThumbnailImage[];description:string}){
  const first=[...(images??[])].sort((a,b)=>a.sort_order-b.sort_order||a.id.localeCompare(b.id))[0];
  // Reset image loading/preview state whenever the selected image changes.
  return <Thumbnail key={first?.storage_path??"empty"} photo={first} description={description}/>;
}
function Thumbnail({photo,description}:{photo?:PartThumbnailImage;description:string}){
  const anchor=useRef<HTMLElement>(null);
  const [url,setUrl]=useState(""),[failed,setFailed]=useState(false);
  const [preview,setPreview]=useState<{left:number;top:number}|null>(null);
  const path=photo?.storage_path;
  useEffect(()=>{
    if(!path)return;
    const db=getSupabaseBrowserClient();if(!db)return;
    let alive=true,started=false,timer:ReturnType<typeof setInterval>|undefined;
    async function sign(){
      try{
        const result=await db!.storage.from("part-images").createSignedUrl(path!,3600);
        if(alive&&!result.error&&result.data)setUrl(result.data.signedUrl);
      }catch{/* A missing photo must not prevent searching for parts. */}
    }
    const start=()=>{
      if(started)return;started=true;void sign();
      timer=setInterval(()=>void sign(),50*60*1000);
    };
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){start();observer.disconnect();}},{rootMargin:"160px"});
    if(anchor.current)observer.observe(anchor.current);
    return()=>{alive=false;observer.disconnect();if(timer)clearInterval(timer);};
  },[path]);
  useEffect(()=>{
    if(!preview)return;
    const close=()=>setPreview(null);
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape")close();};
    window.addEventListener("scroll",close,true);window.addEventListener("resize",close);window.addEventListener("keydown",key);
    return()=>{window.removeEventListener("scroll",close,true);window.removeEventListener("resize",close);window.removeEventListener("keydown",key);};
  },[preview]);
  function show(){
    if(!url||failed||!anchor.current)return;
    const rect=anchor.current.getBoundingClientRect(),size=Math.min(240,window.innerWidth-24,window.innerHeight-24);
    setPreview({left:Math.max(12,Math.min(rect.right+12,window.innerWidth-size-12)),top:Math.max(12,Math.min(rect.top,window.innerHeight-size-12))});
  }
  const available=!!url&&!failed;
  return <i ref={anchor} className="part-thumbnail" tabIndex={available?0:undefined}
    aria-label={available?`Preview photo of ${description}`:undefined}
    onMouseEnter={()=>{if(window.matchMedia("(hover: hover) and (pointer: fine)").matches)show();}}
    onMouseLeave={()=>setPreview(null)} onFocus={show} onBlur={()=>setPreview(null)}>
    {available?<Image unoptimized src={url} width={40} height={40} alt={photo?.caption||description} onError={()=>{setFailed(true);setPreview(null);}}/>:<BoxIcon/>}
    {preview&&available&&createPortal(<div className="part-thumbnail-preview" style={preview} aria-hidden="true"><Image unoptimized src={url} width={240} height={240} alt=""/></div>,document.body)}
  </i>;
}
