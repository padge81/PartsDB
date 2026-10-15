'use client';
import {Children,isValidElement,useEffect,useId,useRef,useState,type ReactNode,type SelectHTMLAttributes} from 'react';
import {narrowOptions} from '../lib/select-search';
type Props=SelectHTMLAttributes<HTMLSelectElement>&{searchLabel:string};
function optionText(value:ReactNode):string{
 return Children.toArray(value).map(child=>isValidElement<{children?:ReactNode}>(child)?optionText(child.props.children):String(child)).join('');
}
export function SearchableSelect({children,searchLabel,onChange,...props}:Props){
 const options=Children.toArray(children).flatMap(child=>{
  if(!isValidElement<{value?:string|number;children?:ReactNode;disabled?:boolean}>(child)||child.type!=='option')return [];
  const label=optionText(child.props.children);
  return [{value:String(child.props.value??label),label,node:child}];
 });
 const initial=String(props.defaultValue??options[0]?.value??'');
 const [query,setQuery]=useState(''),[uncontrolled,setUncontrolled]=useState(initial);
 const selected=String(props.value??uncontrolled);
 const select=useRef<HTMLSelectElement>(null),hintId=useId();
 useEffect(()=>{
  const form=select.current?.form;
  const reset=()=>{setQuery('');setUncontrolled(initial);};
  form?.addEventListener('reset',reset);
  return()=>form?.removeEventListener('reset',reset);
 },[initial]);
 const {visible,matches,selectionKept}=narrowOptions(options,query,selected);
 return <span className="searchable-select">
  <input className="select-search-input" type="search" value={query} disabled={props.disabled}
   aria-label={'Filter '+searchLabel} aria-controls={props.id} autoComplete="off"
   placeholder={'Type to filter '+searchLabel+'…'} onChange={event=>setQuery(event.target.value)}
   onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();if(event.key==='Escape'){setQuery('');event.stopPropagation();}}}/>
  <select {...props} ref={select} aria-label={props['aria-label']??searchLabel} aria-describedby={[props['aria-describedby'],query?hintId:''].filter(Boolean).join(' ')||undefined}
   onChange={event=>{setUncontrolled(event.target.value);setQuery('');onChange?.(event);}}>
   {visible.map(option=>option.node)}
  </select>
  {query&&<span id={hintId} className="select-search-hint" role="status">{matches?matches+' matching option'+(matches===1?'':'s'):'No matching options'}{selectionKept?' · current selection kept':''}</span>}
 </span>;
}
