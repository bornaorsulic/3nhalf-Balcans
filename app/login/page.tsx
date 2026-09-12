"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Activity, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, useSession } from "@/lib/session";

const DEMO_ACCOUNTS = [
  { email: "sofia@demo.health", label: "Sofia Lind", role: "Patient with a year of data" },
  { email: "mikael@demo.health", label: "Mikael Anders", role: "Patient with no data yet" },
  { email: "eriksson@demo.health", label: "Dr. Eriksson", role: "Doctor with two patients" },
  { email: "moreau@demo.health", label: "Dr. Moreau", role: "Doctor with a pending request" },
];

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      await refresh();
      const next = params.get("next");
      router.replace(next || (user.role === "patient" ? "/patient" : "/clinician"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Longevity Health Agent</span>
        </Link>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Patients and doctors use the same sign-in.</p>

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <div>
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className="mt-1" placeholder="you@example.com" />
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <Input id="password" type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} className="mt-1" placeholder="••••••••" />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
            )}

            <Button type="submit" disabled={busy} className="w-full gap-2">
              <LogIn className="size-4" />
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            New here?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">Create an account</Link>
          </p>
        </div>

        <div className="mt-5 rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold">Demo accounts</p>
          <p className="mt-1 text-xs text-muted-foreground">Password for all of them: <code className="font-mono">demo1234</code></p>
          <ul className="mt-3 space-y-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => { setEmail(account.email); setPassword("demo1234"); }}
                  className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition hover:border-primary/50 hover:bg-muted/60"
                >
                  <span>
                    <span className="font-medium">{account.label}</span>
                    <span className="block text-xs text-muted-foreground">{account.role}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">use</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
          Hackathon prototype with fictional patients. Not medical advice, and not for real patient data.
        </p>
      </div>
    </main>
  );
}
