"use client";

import Link from "@/components/plain-link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Activity, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAccount, useSession } from "@/lib/session";

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [role, setRole] = useState<"patient" | "clinician">("patient");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await registerAccount({ email, password, role, displayName, inviteCode: inviteCode || undefined, consent });
      await refresh();
      router.replace(user.role === "patient" ? "/patient" : "/clinician");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the account");
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
          <h1 className="text-xl font-semibold">Create an account</h1>

          <div className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1" role="group" aria-label="Account type">
            {(["patient", "clinician"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={role === option}
                onClick={() => setRole(option)}
                className={`min-h-9 rounded-sm text-sm font-medium transition ${
                  role === option ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option === "patient" ? "I am a patient" : "I am a doctor"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div>
              <label htmlFor="name" className="text-sm font-medium">Full name</label>
              <Input id="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1" placeholder={role === "patient" ? "Sofia Lind" : "Dr. Eriksson"} />
            </div>
            <div>
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className="mt-1" placeholder="you@example.com" />
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)} className="mt-1" placeholder="At least 8 characters" />
            </div>

            {role === "clinician" && (
              <div>
                <label htmlFor="invite" className="text-sm font-medium">Invite code</label>
                <Input id="invite" required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
                  className="mt-1" placeholder="LONGEVITY-2026" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Doctor accounts need a code, so nobody can give themselves access to patient records.
                </p>
              </div>
            )}

            <label className="flex items-start gap-2.5 rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--pm-primary)]" required />
              <span>
                I understand this is a hackathon prototype with fictional data. It does not give medical advice, and I will
                not enter real patient information. {role === "patient" && "Doctors I connect to can see the health data in my account."}
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
            )}

            <Button type="submit" disabled={busy} className="w-full gap-2">
              <UserPlus className="size-4" />
              {busy ? "Creating…" : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
