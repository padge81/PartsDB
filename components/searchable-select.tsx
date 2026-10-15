'use client';
import {Children,isValidElement,useEffect,useId,useRef,useState,type ReactNode,type SelectHTMLAttributes} from 'react';
import {createPortal} from 'react-dom';
import {matchingOptions} from '../lib/select-search';
type Props=SelectHTMLAttributes<HTMLSelectElement>&{searchLabel:string};
function text(value:ReactNode):string{
 return Children.toArray(value).map(child=>isValidElement<{children?:ReactNode}>(child)?text(child.props.children):String(child)).join('');
}
export function SearchableSelect({children,searchLabel,onChange,...props}:Props){
 const options=Children.toArray(children).flatMap(child=>{
  if(!isValidElement<{value?:string|number;children?:ReactNode;disabled?:boolean}>(child)||child.type!=='option')return [];
  const label=text(child.props.children);
  return [{value:String(child.props.value??label),label,disabled:!!child.props.disabled,node:child}];
 });
 const initial=String(props.defaultValue??options[0]?.value??'');
 const [uncontrolled,setUncontrolled]=useState(initial),[open,setOpen]=useState(false);
 const [query,setQuery]=useState<string|null>(null),[active,setActive]=useState(-1);
 const [position,setPosition]=useState({left:0,top:0,width:0,maxHeight:260,transform:'none'});
 const input=useRef<HTMLInputElement>(null),select=useRef<HTMLSelectElement>(null),list=useRef<HTMLDivElement>(null);
 const id=useId(),listId=id+'-options',inputId=props.id??id;
 const selected=String(props.value??uncontrolled),current=options.find(option=>option.value===selected);
 const visible=matchingOptions(options,query??'');
 const display=query??(current?.value?current.label:'');
 function close(){setOpen(false);setQuery(null);setActive(-1);}
 function show(){if(input.current?.matches(':disabled'))return;setOpen(true);setActive(-1);}
 function choose(value:string){
  if(input.current?.matches(':disabled')||options.find(option=>option.value===value)?.disabled)return;
  const element=select.current;if(!element)return;
  element.value=value;
  element.dispatchEvent(new Event('change',{bubbles:true}));
  close();
 }
 useEffect(()=>{
  input.current?.setCustomValidity(props.required&&!selected?'Choose an option from the list.':'');
 },[props.required,selected]);
 useEffect(()=>{
  const form=select.current?.form;
  const reset=()=>{setUncontrolled(initial);setOpen(false);setQuery(null);setActive(-1);};
  form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset);
 },[initial]);
 useEffect(()=>{
  if(!open)return;
  const reposition=()=>{
   const element=input.current;if(!element)return;
   if(element.matches(':disabled')){setOpen(false);return;}
   const rect=element.getBoundingClientRect(),viewport=window.visualViewport;
   const bottom=(viewport?.offsetTop??0)+(viewport?.height??window.innerHeight);
   const below=bottom-rect.bottom-8,above=rect.top-(viewport?.offsetTop??0)-8;
   const upwards=below<150&&above>below,maxHeight=Math.max(60,Math.min(280,upwards?above:below));
   setPosition({left:rect.left,top:upwards?rect.top-4:rect.bottom+4,width:rect.width,maxHeight,transform:upwards?'translateY(-100%)':'none'});
  };
  const frame=requestAnimationFrame(reposition);
  window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);
  window.visualViewport?.addEventListener('resize',reposition);window.visualViewport?.addEventListener('scroll',reposition);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);window.visualViewport?.removeEventListener('resize',reposition);window.visualViewport?.removeEventListener('scroll',reposition);};
 },[open]);
 useEffect(()=>{
  if(open&&active>=0)list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({block:'nearest'});
 },[active,open]);
 return <span className="searchable-select">
  <input ref={input} id={inputId} className="select-combo-input" type="text" role="combobox"
   value={display} disabled={props.disabled} required={props.required} autoComplete="off"
   aria-label={props['aria-label']??searchLabel} aria-describedby={props['aria-describedby']}
   aria-expanded={open} aria-controls={open?listId:undefined} aria-autocomplete="list"
   aria-activedescendant={open&&active>=0&&visible[active]?listId+'-'+active:undefined}
   placeholder={options.find(option=>!option.value)?.label??'Choose '+searchLabel+'…'}
   onFocus={event=>{show();event.currentTarget.select();}} onClick={show} onBlur={close} onInvalid={show}
   onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(-1);}}
   onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     event.preventDefault();if(!open)show();
     const direction=event.key==='ArrowDown'?1:-1;
     let next=active<0?(direction===1?0:visible.length-1):active+direction;
     while(next>=0&&next<visible.length&&visible[next].disabled)next+=direction;
     if(next>=0&&next<visible.length)setActive(next);
    }
    if(event.key==='Enter'&&open){event.preventDefault();if(active>=0&&visible[active])choose(visible[active].value);}
   }}/>
  <span className="select-combo-chevron" aria-hidden="true">⌄</span>
  <select {...props} id={undefined} required={false} hidden aria-hidden="true" tabIndex={-1} ref={select}
   onChange={event=>{setUncontrolled(event.target.value);onChange?.(event);}}>{children}</select>
  {open&&createPortal(<div ref={list} id={listId} role="listbox" aria-label={searchLabel} className="select-combo-options" style={position}>
   {visible.map((option,index)=><button type="button" role="option" tabIndex={-1} key={option.value} id={listId+'-'+index}
    aria-selected={selected===option.value} disabled={option.disabled} data-active={active===index}
    onPointerDown={event=>event.preventDefault()} onClick={()=>choose(option.value)}>{option.label}{selected===option.value&&<span aria-hidden="true"> ✓</span>}</button>)}
   {!visible.some(option=>option.value)&&<span className="select-combo-empty" role="status">No matching options</span>}
  </div>,document.body)}
 </span>;
}
