import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const SearchIcon = (p: IconProps) => <svg {...base} {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
export const BoxIcon = (p: IconProps) => <svg {...base} {...p}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></svg>;
export const ClipboardIcon = (p: IconProps) => <svg {...base} {...p}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6"/></svg>;
export const ShieldIcon = (p: IconProps) => <svg {...base} {...p}><path d="M12 3 4.5 6v5c0 5 3.2 8.2 7.5 10 4.3-1.8 7.5-5 7.5-10V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>;
export const PlusIcon = (p: IconProps) => <svg {...base} {...p}><path d="M12 5v14M5 12h14"/></svg>;
export const ArrowIcon = (p: IconProps) => <svg {...base} {...p}><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
export const LogOutIcon = (p: IconProps) => <svg {...base} {...p}><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></svg>;
