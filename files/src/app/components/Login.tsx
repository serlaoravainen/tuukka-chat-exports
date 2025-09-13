 "use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { toast } from "sonner";

export default function Login() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [mode, setMode] = useState<"magic" | "password">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loadingMagic, setLoadingMagic] = useState(false);
  const [loadingPwd, setLoadingPwd] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const emailValid = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);
  const canMagic = emailValid && !loadingMagic && !sendingReset;
  const canPwd = emailValid && password.length >= 8 && !loadingPwd;
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!canMagic) return;
    setError(null);
    setLoadingMagic(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: origin ? `${origin}/` : undefined,
        },
      });
      if (error) throw error;
      toast.success("Kirjautumislinkki lähetetty sähköpostiisi.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Linkin lähetys epäonnistui.");
      toast.error("Linkin lähetys epäonnistui");
    } finally {
      setLoadingMagic(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!canPwd) return;
    setError(null);
    setLoadingPwd(true);
    try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Kirjautuminen onnistui");
      router.push("/");
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Kirjautuminen epäonnistui.");
      toast.error("Kirjautuminen epäonnistui");
    } finally {
      setLoadingPwd(false);
    }
  }

  async function handleSendRecovery() {
    if (!emailValid || sendingReset) return;
    setError(null);
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: origin ? `${origin}/set-password` : undefined,
      });
      if (error) throw error;
      toast.success("Salasanan palautuslinkki lähetetty sähköpostiisi.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Palautuslinkin lähetys epäonnistui.");
      toast.error("Palautuslinkin lähetys epäonnistui");
    } finally {
      setSendingReset(false);
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">Kirjaudu sisään</h1>
        <div className="flex justify-center gap-2">
          <Button
            type="button"
            variant={mode === "password" ? "default" : "outline"}
            onClick={() => setMode("password")}
          >
            Salasana
          </Button>
          <Button
            type="button"
            variant={mode === "magic" ? "default" : "outline"}
            onClick={() => setMode("magic")}
          >
            Magic link
          </Button>
        </div>

        {error && (
          <div className="rounded bg-red-100 p-2 text-sm text-red-700">{error}</div>
        )}

        {mode === "magic" ? (
          <form onSubmit={handleMagicLink} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Sähköposti</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sähköposti@esimerkki.com"
                required
              />
    </div>
            <Button type="submit" className="w-full" disabled={!canMagic}>
              {loadingMagic ? "Lähetetään…" : "Lähetä linkki"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Sähköposti</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sähköposti@esimerkki.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Salasana</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Vähintään 8 merkkiä"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={!canPwd}>
              {loadingPwd ? "Kirjaudutaan…" : "Kirjaudu sisään"}
            </Button>

            <div className="text-center text-sm">
              Unohtunut salasana?{" "}
              <button
                type="button"
                onClick={handleSendRecovery}
                className="underline text-blue-700 disabled:opacity-50"
                disabled={!emailValid || sendingReset}
                title="Syötä ensin sähköpostiosoite"
              >
                Lähetä palautuslinkki
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}