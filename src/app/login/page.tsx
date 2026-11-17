"use client";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "verifying" | string>("idle");
  const inFlight = useRef(false);

  // Errors handed back by /auth/confirm or /auth/callback.
  useEffect(() => {
    const e = new URLSearchParams(location.search).get("error");
    if (e) setState(e);
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    // One request at a time: a double click used to send two, and the second
    // failed with "Database error saving new user" while the first succeeded.
    if (inFlight.current) return;
    inFlight.current = true;
    setState("sending");
    const { error } = await browserClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    inFlight.current = false;
    setState(error ? (error.code === "over_email_send_rate_limit"
      ? "Too many sign-in emails in the last hour (the built-in email service allows 2 per hour). Try again later, or use the code from the last email below."
      : error.message) : "sent");
  }

  /** Typing the 6-digit code from the email works in any browser: nothing has to be stored first. */
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setState("verifying");
    const { error } = await browserClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    inFlight.current = false;
    if (error) { setState(`${error.message}. Check the code, or request a new email.`); return; }
    location.href = "/";
  }

  const showError = !["idle", "sending", "sent", "verifying"].includes(state);
  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      {state !== "sent" && state !== "verifying" && (
        <form onSubmit={send} className="card">
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button className="primary" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a link"}</button>
          {email && <button type="button" onClick={() => setState("sent")}>I already have a code</button>}
        </form>
      )}
      {(state === "sent" || state === "verifying" || (showError && email)) && (
        <form onSubmit={verify} className="card">
          <p style={{ margin: 0 }}>Check your email. Click the link, <b>or</b> type the 6-digit code here. It can take a minute; check spam too.</p>
          <label>Code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" /></label>
          <button className="primary" disabled={state === "verifying" || code.trim().length < 6}>{state === "verifying" ? "Signing in…" : "Sign in with code"}</button>
          <button type="button" onClick={() => { setCode(""); setState("idle"); }}>Use a different email</button>
        </form>
      )}
      {showError && <pre className="err">{state}</pre>}
    </main>
  );
}
