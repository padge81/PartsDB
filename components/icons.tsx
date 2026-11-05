import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const SearchIcon = (p: IconProps) => <svg {...base} {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
export const BoxIcon = (p: IconProps) => <svg {...base} {...p}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></svg>;
export const ClipboardIcon = (p: IconProps) => <svg {...base} {...p}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6"/></svg>;
export const ShieldIcon = (p: IconProps) => <svg {...base} {...p}><path d="M12 3 4.5 6v5c0 5 3.2 8.2 7.5 10 4.3-1.8 7.5-5 7.5-10V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>;
export const PlusIcon = (p: IconProps) => <svg {...base} {...p}><path d="M12 5v14M5 12h14"/></svg>;
export const ArrowIcon = (p: IconProps) => <svg {...base} {...p}><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
export const ChevronIcon = (p: IconProps) => <svg {...base} {...p}><path d="m7 10 5 5 5-5"/></svg>;
export const LogOutIcon = (p: IconProps) => <svg {...base} {...p}><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></svg>;
export const CopyIcon = (p: IconProps) => <svg {...base} {...p}><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
export const BookOpenIcon = (p: IconProps) => <svg {...base} {...p}><path d="M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Zm0 0v15"/></svg>;
export const SaveIcon = (p: IconProps) => <svg {...base} {...p}><path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h10V3M7 21v-8h10v8"/></svg>;
export const FileDownloadIcon = (p: IconProps) => <svg {...base} {...p}><path d="M14 2H5v20h14V7l-5-5Zm0 0v5h5M12 10v7m-3-3 3 3 3-3"/></svg>;
export const CheckIcon = (p: IconProps) => <svg {...base} {...p}><path d="m5 12 4 4L19 6"/></svg>;
export const CloseIcon = (p: IconProps) => <svg {...base} {...p}><path d="m6 6 12 12M6 18 18 6"/></svg>;
export const PencilIcon = (p: IconProps) => <svg {...base} {...p}><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14l-1 7 6-2"/></svg>;
