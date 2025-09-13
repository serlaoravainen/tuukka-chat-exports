"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supaBaseClient";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";

export default function SetPassword() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [exchanging, setExchanging] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Recovery-linkki tuo ?code=... (ei token)
  const code = useMemo(() => searchParams.get("code"), [searchParams]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setExchanging(true);
      setError(null);
      try {
        // 1) Onko sessio jo valmiina?
        const { data: s0 } = await supabase.auth.getSession();
        if (s0.session) {
          if (!mounted) return;
          setHasSession(true);
          setAuthReady(true);
          return;
        }

        // 2) ?code=... (recovery-linkin code-muoto)
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          const { data: s1 } = await supabase.auth.getSession();
          if (!mounted) return;
          setHasSession(Boolean(s1.session));
          setAuthReady(true);
          return;
        }

        // 3) Fallback: URL-hash sisältää access_token/refresh_token
        if (typeof window !== "undefined" && window.location.hash) {
          const hash = new URLSearchParams(window.location.hash.slice(1));
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            const { error: setErr } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (setErr) throw setErr;

            // Siivoa hash pois URL:ista
            try {
              window.history.replaceState({}, "", window.location.pathname);
            } catch (_) {}

            const { data: s2 } = await supabase.auth.getSession();
            if (!mounted) return;
            setHasSession(Boolean(s2.session));
            setAuthReady(true);
            return;
          }
        }

        // 4) Ei sessiota eikä codea/hashia → virhetila
        if (!mounted) return;
        setHasSession(false);
        setAuthReady(true);
        setError("Linkki puuttuu tai on vanhentunut. Pyydä uusi linkki.");
      } catch (e: any) {
        if (!mounted) return;
        console.error("[set-password] exchange failed", e);
        setHasSession(false);
        setAuthReady(true);
        setError(e?.message ?? "Kirjautumislinkin vahvistus epäonnistui.");
      } finally {
        if (mounted) setExchanging(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [code, searchParams]); // varmistetaan että hash-muutos myös triggaa tarvittaessa

  const canSubmit =
    hasSession && password.length >= 8 && password === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasSession) {
      setError("Vahvista kirjautumislinkki ensin (pyydä uusi linkki).");
      return;
  }
    if (password.length < 8) {
      setError("Salasanan tulee olla vähintään 8 merkkiä.");
      return;
    }
    if (password !== confirm) {
      setError("Salasanat eivät täsmää.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      setSuccess(true);
      setTimeout(() => router.push("/"), 1200);
    } catch (e: any) {
      console.error("[SetPassword]", e);
      setError(e?.message || "Salasanan asettaminen epäonnistui.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg space-y-3"
      >
        <h1 className="text-xl font-semibold">Aseta salasana</h1>

        {!authReady || exchanging ? (
          <div className="text-sm text-gray-600">
            Vahvistetaan kirjautumislinkkiä…
          </div>
        ) : !hasSession ? (
          <div className="rounded bg-yellow-100 p-2 text-sm text-yellow-800">
            Linkkiä ei voitu vahvistaa. Avaa sähköpostin linkki uudelleen tai
            pyydä uusi linkki adminilta.
          </div>
        ) : null}

        {error && (
          <div className="rounded bg-red-100 p-2 text-sm text-red-700">
            {error}
    </div>
        )}
        {success && (
          <div className="rounded bg-green-100 p-2 text-sm text-green-700">
            Salasana asetettu! Ohjataan sisään…
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700">
          Uusi salasana
        </label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />

        <label className="block text-sm font-medium text-gray-700">
          Vahvista salasana
        </label>
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
        />

        <Button type="submit" disabled={!canSubmit} className="w-full">
          {loading ? "Tallennetaan…" : "Tallenna salasana"}
        </Button>
      </form>
    </div>
  );
}

