"use client";

import { FormEvent, useEffect, useState } from "react";
import { createBrowserSupabase } from "../../lib/supabase/client";

export function ResetPasswordForm() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("Checking your secure recovery link…");

  useEffect(() => {
    void (async () => {
      const supabase = createBrowserSupabase();
      const result = await supabase.auth.getSession();
      const valid = Boolean(result.data.session) && !result.error;
      setReady(valid);
      setMessage(valid ? "" : "This recovery link is invalid or has expired. Request a new link and try again.");
    })();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password.length < 12) {
      setMessage("Use at least 12 characters for your password.");
      setBusy(false);
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      setBusy(false);
      return;
    }
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMessage(error.message);
    else {
      setComplete(true);
      setMessage("Password saved. You can now sign in to the team portal.");
      await supabase.auth.signOut();
    }
    setBusy(false);
  }

  if (complete) return <div className="portal-auth-form"><p role="status">{message}</p><a className="admin-signin" href="/admin-login">Go to team sign in ↗</a></div>;

  return <form className="portal-auth-form" onSubmit={submit}>
    <label>New password<input name="password" type="password" required minLength={12} autoComplete="new-password" disabled={!ready} /></label>
    <label>Confirm new password<input name="confirmation" type="password" required minLength={12} autoComplete="new-password" disabled={!ready} /></label>
    <button className="admin-signin" disabled={!ready || busy}>{busy ? "Saving…" : "Set password ↗"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
