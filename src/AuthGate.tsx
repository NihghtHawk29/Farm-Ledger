import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode, FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Sprout, Loader2 } from "lucide-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import FarmLedger from "./FarmLedger";

const palette = {
  "--ink": "#22301C", "--paper": "#E7E0C7", "--card": "#F2EEDC", "--rust": "#A6501C",
  "--gold": "#C68A1D", "--leaf": "#35502A", "--muted": "#5C5240", "--line": "#CBBF9B",
} as CSSProperties;

function Screen({ children }: { children: ReactNode }) {
  return (
    <div style={{
      ...palette, background: "var(--paper)", minHeight: "100svh", color: "var(--ink)",
      fontFamily: "'Inter', system-ui, sans-serif", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      {children}
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16,
  padding: "28px 26px", width: "100%", maxWidth: 400, boxShadow: "0 8px 30px rgba(34,48,28,0.12)",
};
const inputStyle: CSSProperties = {
  border: "1px solid var(--line)", borderRadius: 8, padding: "10px 11px", fontSize: 14,
  background: "#fff", color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box",
};

/** Not-yet-configured helper screen. */
function SetupNeeded() {
  return (
    <Screen>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, marginBottom: 12 }}>
          <Sprout size={20} color="var(--leaf)" /> Thota Patti
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 10px" }}>
          Supabase isn't configured yet. Add your project credentials to the{" "}
          <code style={{ background: "#efe9d2", padding: "1px 5px", borderRadius: 4 }}>.env</code> file
          in the project root:
        </p>
        <pre style={{ background: "#22301C", color: "#E7E0C7", padding: "12px 14px", borderRadius: 8, fontSize: 12, overflowX: "auto", margin: "0 0 10px" }}>
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}
        </pre>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--muted)", margin: 0 }}>
          Find them in Supabase → Project Settings → Data API + API Keys, then
          restart <code style={{ background: "#efe9d2", padding: "1px 5px", borderRadius: 4 }}>npm run dev</code>.
        </p>
      </div>
    </Screen>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is ON, there's no active session yet.
        if (!data.session) {
          setMsg({ kind: "info", text: "Account created. Check your inbox to confirm your email, then sign in." });
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setMsg({ kind: "error", text: err?.message || "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22, marginBottom: 4 }}>
          <Sprout size={22} color="var(--leaf)" /> Thota Patti
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
          {mode === "signin" ? "Sign in to your farm ledger." : "Create your farm ledger account."}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
            Email
            <input type="email" autoComplete="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
            Password
            <input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </label>

          {msg && (
            <div style={{
              fontSize: 12.5, borderRadius: 8, padding: "8px 11px", lineHeight: 1.5,
              color: msg.kind === "error" ? "#5C2A10" : "#22301C",
              background: msg.kind === "error" ? "#F6E4D9" : "#e4ecd9",
              border: `1px solid ${msg.kind === "error" ? "var(--rust)" : "var(--leaf)"}`,
            }}>
              {msg.text}
            </div>
          )}

          <button type="submit" disabled={busy} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            background: "var(--leaf)", color: "#F4F0DE", border: "none", borderRadius: 9,
            padding: "11px 14px", fontWeight: 600, fontSize: 14, cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1, marginTop: 2,
          }}>
            {busy && <Loader2 size={15} className="spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}
            style={{ background: "none", border: "none", color: "var(--rust)", fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </div>
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </Screen>
  );
}

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <SetupNeeded />;

  if (loading) {
    return (
      <Screen>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
          <Loader2 size={18} className="spin" /> Loading…
          <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </Screen>
    );
  }

  if (!session) return <AuthForm />;

  return (
    <FarmLedger
      session={session}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}
