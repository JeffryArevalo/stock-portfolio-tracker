"use client";

/* ✅ IMPORTS
   This block brings in React tools and Next.js navigation.
   - useState: lets us store the email/password in the form
   - useRouter: lets us send the user to another page (like "/") after login
*/
import React, { useState } from "react";
import { useRouter } from "next/navigation";

/* ✅ SUPABASE CLIENT
   This imports your Supabase client so we can sign users in and sign them up.
*/
import { createClient } from "../../src/lib/supabase/client";

export default function Page() {
  /* ✅ ROUTER
     This lets us redirect users after successful login/signup.
  */
  const router = useRouter();

  /* ✅ SUPABASE INSTANCE
     This creates the Supabase client we use to call auth actions.
  */
  const supabase = createClient();

  /* ✅ FORM STATE
     These store what the user types into the email and password boxes.
  */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /* ✅ UI STATE
     - loading: disables buttons while an auth request is happening
     - msg: shows success or error messages under the buttons
  */
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /* ✅ SIGN UP
     Creates a new Supabase user account with email + password.
     After success, we redirect the user to the dashboard ("/").
  */
  async function signUp() {
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    // If email confirmation is ON, user may need to confirm first.
    setMsg("✅ Account created. If email confirmation is enabled, check your inbox.");

    // Send user to homepage (or keep on login if you prefer)
    router.push("/");
    router.refresh();
  }

  /* ✅ SIGN IN
     Logs in an existing user using email + password.
     After success, we redirect the user to the dashboard ("/").
  */
  async function signIn() {
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    // After login, send user to homepage (dashboard)
    router.push("/");
    router.refresh();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#0b1220",
        color: "white",
        fontFamily: "system-ui, Arial",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 20,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.06)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Login</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Sign in to save your portfolio online.
        </p>

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button
              onClick={signIn}
              disabled={loading}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(74,192,222,0.25)",
                color: "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {loading ? "..." : "Sign In"}
            </button>

            <button
              onClick={signUp}
              disabled={loading}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(99,102,241,0.25)",
                color: "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {loading ? "..." : "Sign Up"}
            </button>
          </div>

          {msg && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 13,
              }}
            >
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}