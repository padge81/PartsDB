"use client";
import {useEffect,useState} from "react";
import {CopyIcon} from "./icons";
export function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Could not copy");
    }
  }
  return <button type="button" title={label} aria-label={label} onClick={copy}>
    <CopyIcon/><span className="sr-only" role="status">{status}</span>{status && <em aria-hidden="true">{status}</em>}
  </button>;
}