"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowIcon, BoxIcon, SearchIcon, ShieldIcon } from "./icons";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSupabaseBrowserClient()?.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("The public Supabase browser key still needs to be configured.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else router.push("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Link className="brand brand-light" href="/" aria-label="PartsDB home"><span className="brand-mark"><BoxIcon /></span><span>PartsDB</span></Link>
        <div className="story-content">
          <p className="eyebrow">External parts repository</p>
          <h1>The right part.<br />The first time.</h1>
          <p className="story-copy">A reliable source for machine compatibility, supplier ordering details and approved parts information.</p>
          <div className="feature-list">
            <div><span><SearchIcon /></span><p><strong>Search with context</strong>Find by machine, revision, supplier or part number.</p></div>
            <div><span><ShieldIcon /></span><p><strong>Controlled information</strong>Every new part passes through administrator approval.</p></div>
          </div>
        </div>
        <p className="story-foot">Built for technicians, maintainers and purchasing teams.</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand"><span className="brand-mark"><BoxIcon /></span><strong>PartsDB</strong></div>
          <p className="eyebrow accent">Welcome back</p>
          <h2>Sign in to continue</h2>
          <p className="muted">Use the account provided by your PartsDB administrator.</p>
          <form onSubmit={signIn}>
            <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="email" required /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required /></label>
            {message && <p className="form-message" role="alert">{message}</p>}
            <button className="button primary wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowIcon /></button>
          </form>
          {!isSupabaseConfigured && <button className="text-button" onClick={() => router.push("/dashboard")}>Open interface preview</button>}
          <p className="support-copy">Need access? Contact your PartsDB administrator.</p>
        </div>
      </section>
    </main>
  );
}
