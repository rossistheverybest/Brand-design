"use client";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");
  const inFlight = useRef(false);

  // Errors handed back by /auth/callback (expired link, not on the allow list...).
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
      ? "Too many sign-in emails in the last hour (the built-in email service allows 2 per hour). Try again later, and use the most recent email's link."
      : error.message) : "sent");
  }

  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      {state === "sent" ? (
        <div className="card">
          <p style={{ margin: 0 }}>Check your email for the sign-in link. It can take a minute; check spam too.</p>
          <button style={{ justifySelf: "start" }} onClick={() => setState("idle")}>Use a different email</button>
        </div>
      ) : (
        <form onSubmit={send} className="card">
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button className="primary" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a link"}</button>
          {!["idle", "sending"].includes(state) && <pre className="err">{state}</pre>}
        </form>
      )}
    </main>
  );
}
