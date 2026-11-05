'use client';
import {useId,type ReactNode} from 'react';

export function WorkshopAction({label,icon,disabled=false,pending=false,onClick,href}:{label:string;icon:ReactNode;disabled?:boolean;pending?:boolean;onClick?:()=>void;href?:string}){
 const tooltip=useId();
 const content=<>{pending?<span className="wk-tool-spinner" aria-hidden="true"/>:icon}<span className="wk-action-label">{pending?'Saving…':label}</span></>;
 return <span className="wk-action-wrap">
  {href?<a className="button secondary wk-tool-button" href={disabled?undefined:href} role="link" tabIndex={disabled?-1:undefined} aria-disabled={disabled||undefined} aria-label={label} aria-describedby={tooltip}>{content}</a>:<button type="button" className="button secondary wk-tool-button" disabled={disabled} aria-busy={pending||undefined} aria-label={label} aria-describedby={tooltip} onClick={onClick}>{content}</button>}
  <span id={tooltip} className="wk-action-tooltip" role="tooltip">{label}</span>
 </span>;
}
