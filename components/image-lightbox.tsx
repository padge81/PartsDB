"use client";
import Image from "next/image";
import {useEffect,useRef} from "react";

export function ImageLightbox({src,alt,caption,onClose}:{src:string;alt:string;caption:string;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const node=dialog.current;
    if(!node)return;
    const opener=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    node.showModal();
    return()=>{
      node.close();
      document.body.style.overflow=overflow;
      if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();
    };
  },[]);
  return <dialog ref={dialog} className="image-lightbox" aria-label="Part image preview"
    onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <button autoFocus className="lightbox-close" type="button" onClick={onClose} aria-label="Close image">×</button>
    <div><Image unoptimized width={1400} height={1400} src={src} alt={alt}/><p>{caption}</p></div>
  </dialog>;
}
