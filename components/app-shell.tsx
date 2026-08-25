"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { BoxIcon, ClipboardIcon, LogOutIcon, SearchIcon, ShieldIcon } from "./icons";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase";
import { APP_REVISION } from "../lib/version";
import { useBomCart } from "../lib/bom-cart";

export type Profile = { id: string; display_name: string | null; role: "user" | "admin"; is_active: boolean };
export type SiteMode = "live" | "standby" | "maintenance";
export type ChangeSiteMode = (mode: SiteMode) => Promise<boolean>;

const standbyBlockedPaths = [
  /^\/parts\/new$/,
  /^\/admin\/parts\/[^/]+\/edit$/,
  /^\/admin\/requests\/[^/]+$/,
  /^\/admin\/machines(?:\/|$)/,
  /^\/admin\/reference-data(?:\/|$)/,
  /^\/admin\/bulk-import(?:\/|$)/,
];

export function AppShell({ children, requireAdmin = false }: {
  children: (profile: Profile, siteMode: SiteMode, changeSiteMode: ChangeSiteMode) => ReactNode;
  requireAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(() => isSupabaseConfigured ? null : { id: "preview", display_name: "Stuart Padgett", role: "admin", is_active: true });
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");
  const [modeError, setModeError] = useState("");
  const [databaseRevision, setDatabaseRevision] = useState(isSupabaseConfigured ? "checking" : "not connected");
  const [siteMode, setSiteMode] = useState<SiteMode>("live");
  const bomCart = useBomCart();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data, error: authError }) => {
      if (authError || !data.user) {
        router.replace("/");
        return;
      }
      const [{ data: profileData, error: profileError }, { data: metadata }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, role, is_active").eq("id", data.user.id).single(),
        supabase.from("system_metadata").select("key,value").in("key", ["database_revision", "site_mode"]),
      ]);
      const metadataMap = Object.fromEntries((metadata ?? []).map((row) => [row.key, row.value]));
      setDatabaseRevision(metadataMap.database_revision ?? "unavailable");
      setSiteMode(["live", "standby", "maintenance"].includes(metadataMap.site_mode) ? metadataMap.site_mode as SiteMode : "standby");
      if (profileError || !profileData) setError("Your PartsDB profile could not be loaded.");
      else if (!profileData.is_active) setError("This PartsDB account is inactive.");
      else setProfile(profileData as Profile);
      setLoading(false);
    });
  }, [router]);

  async function changeSiteMode(mode: SiteMode) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || profile?.role !== "admin") return false;
    setModeError("");
    const { data, error: updateError } = await supabase.rpc("set_site_mode", { new_mode: mode });
    if (updateError || data !== mode) {
      setModeError(updateError?.message ?? "The site mode could not be changed.");
      return false;
    }
    setSiteMode(mode);
    return true;
  }

  async function enableMaintenance() {
    if (window.prompt("Type ENABLE EDITING to temporarily allow database changes.") !== "ENABLE EDITING") return;
    await changeSiteMode("maintenance");
  }

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    router.push("/");
  }

  if (loading) return <main className="state-page"><div className="spinner"/><p>Loading PartsDB…</p></main>;
  if (error) return <main className="state-page"><ShieldIcon/><h1>Access unavailable</h1><p>{error}</p><button className="button primary" onClick={signOut}>Return to sign in</button></main>;
  if (!profile) return null;
  if (requireAdmin && profile.role !== "admin") return <main className="state-page"><ShieldIcon/><h1>Administrator access required</h1><a className="button primary" href="/dashboard">Return to parts search</a></main>;

  const initials = (profile.display_name ?? "Parts User").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const blockedByStandby = siteMode === "standby" && standbyBlockedPaths.some((pattern) => pattern.test(pathname));

  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="brand" href="/dashboard"><span className="brand-mark"><BoxIcon /></span><span>PartsDB</span></a>
        <nav aria-label="Main navigation">
          <a className={pathname === "/dashboard" ? "active" : ""} href="/dashboard"><SearchIcon/>Parts</a>
          <Link className={pathname === "/requests" ? "active" : ""} href="/requests"><ClipboardIcon/>My requests</Link>
          <Link className={pathname === "/bom" ? "active" : ""} href="/bom"><BoxIcon/>BOM <span className="nav-count">{bomCart.reduce((total, item) => total + item.quantity, 0)}</span></Link>
          {profile.role === "admin" && <a className={pathname === "/admin" ? "active" : ""} href="/admin"><ShieldIcon/>Admin</a>}
        </nav>
        <div className="account"><span className="avatar">{initials}</span><span className="account-copy"><strong>{profile.display_name ?? "Parts user"}</strong><small>{profile.role === "admin" ? "Administrator" : "Standard user"}</small></span><button title="Sign out" onClick={signOut}><LogOutIcon/></button></div>
      </header>
      {!isSupabaseConfigured && <div className="preview-banner">Interface preview · connect the Supabase browser key to use live data</div>}
      {siteMode === "standby" && <div className="site-mode-banner standby"><strong>Standby — read only</strong><span>Database and image changes are disabled on this server.</span>{profile.role === "admin" && <button type="button" onClick={() => void enableMaintenance()}>Enable maintenance</button>}</div>}
      {siteMode === "maintenance" && <div className="site-mode-banner maintenance"><strong>Maintenance — editing enabled</strong><span>Return this server to standby after restoring or testing.</span>{profile.role === "admin" && <button type="button" onClick={() => void changeSiteMode("standby")}>Return to standby</button>}</div>}
      {modeError && <div className="site-mode-error" role="alert">{modeError}</div>}
      {blockedByStandby ? <main className="state-page"><ShieldIcon/><h1>Standby is read only</h1><p>Enable Maintenance mode before opening this editing function.</p><a className="button secondary" href="/dashboard">Return to parts search</a>{profile.role === "admin" && <button className="button primary" type="button" onClick={() => void enableMaintenance()}>Enable maintenance</button>}</main> : children(profile, siteMode, changeSiteMode)}
      <footer className="revision-footer">App v{APP_REVISION} · DB v{databaseRevision} · {siteMode}</footer>
    </div>
  );
}
