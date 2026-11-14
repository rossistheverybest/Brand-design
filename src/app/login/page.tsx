"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | string>("idle");
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await browserClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setState(error ? error.message : "sent");
  }
  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      {state === "sent" ? <p>Check your email for the sign-in link.</p> : (
        <form onSubmit={send} className="card">
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button className="primary">Email me a link</button>
          {state !== "idle" && <pre className="err">{state}</pre>}
        </form>
      )}
    </main>
  );
}
