"use client";
import { FormEvent, useState } from "react";
import { createBrowserSupabase } from "../lib/supabase/client";

export function AuthForm({ team = false }: { team?: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const next = team ? "/admin-portal" : "/client-portal";
    const access = await fetch("/api/auth/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, portal: team ? "team" : "client" }) });
    const eligibility = await access.json().catch(() => ({ allowed: false }));
    if (!eligibility.allowed) {
      setMessage(team ? "This account is not approved for Velora team access." : "This account is not approved for the client portal.");
      setBusy(false);
      return;
    }
    const supabase = createBrowserSupabase();
    if (password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message); else location.assign(next);
    } else {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
      setMessage(error ? error.message : "Secure sign-in link sent. Check your email.");
    }
    setBusy(false);
  }
  return <form className="portal-auth-form" onSubmit={submit}>
    <label>Email<input name="email" type="email" required autoComplete="email" placeholder="you@company.com"/></label>
    <label>Password <small>(or leave blank for an email link)</small><input name="password" type="password" autoComplete="current-password"/></label>
    <button className="admin-signin" disabled={busy}>{busy ? "Signing in…" : "Continue securely ↗"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
