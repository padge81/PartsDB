"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BoxIcon, ClipboardIcon, LogOutIcon, SearchIcon, ShieldIcon } from "./icons";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase";

export type Profile = { id: string; display_name: string | null; role: "user" | "admin"; is_active: boolean };

export function AppShell({ children, requireAdmin = false }: { children: (profile: Profile) => ReactNode; requireAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(() => isSupabaseConfigured ? null : { id: "preview", display_name: "Stuart Padgett", role: "admin", is_active: true });
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data, error: authError }) => {
      if (authError || !data.user) {
        router.replace("/");
        return;
      }
      const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, display_name, role, is_active").eq("id", data.user.id).single();
      if (profileError || !profileData) setError("Your PartsDB profile could not be loaded.");
      else if (!profileData.is_active) setError("This PartsDB account is inactive.");
      else setProfile(profileData as Profile);
      setLoading(false);
    });
  }, [router]);

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    router.push("/");
  }

  if (loading) return <main className="state-page"><div className="spinner"/><p>Loading PartsDB…</p></main>;
  if (error) return <main className="state-page"><ShieldIcon/><h1>Access unavailable</h1><p>{error}</p><button className="button primary" onClick={signOut}>Return to sign in</button></main>;
  if (!profile) return null;
  if (requireAdmin && profile.role !== "admin") return <main className="state-page"><ShieldIcon/><h1>Administrator access required</h1><a className="button primary" href="/dashboard">Return to parts search</a></main>;

  const initials = (profile.display_name ?? "Parts User").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="brand" href="/dashboard"><span className="brand-mark"><BoxIcon /></span><span>PartsDB</span></a>
        <nav aria-label="Main navigation">
          <a className={pathname === "/dashboard" ? "active" : ""} href="/dashboard"><SearchIcon/>Parts</a>
          <a href="#requests"><ClipboardIcon/>My requests</a>
          {profile.role === "admin" && <a className={pathname === "/admin" ? "active" : ""} href="/admin"><ShieldIcon/>Admin</a>}
        </nav>
        <div className="account"><span className="avatar">{initials}</span><span className="account-copy"><strong>{profile.display_name ?? "Parts user"}</strong><small>{profile.role === "admin" ? "Administrator" : "Standard user"}</small></span><button title="Sign out" onClick={signOut}><LogOutIcon/></button></div>
      </header>
      {!isSupabaseConfigured && <div className="preview-banner">Interface preview · connect the Supabase browser key to use live data</div>}
      {children(profile)}
    </div>
  );
}
