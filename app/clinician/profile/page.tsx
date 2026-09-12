"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, LogOut, Settings2, Stethoscope } from "lucide-react";

import { PasswordForm } from "@/components/profile/password-form";
import { PreferencesForm } from "@/components/profile/preferences-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveClinicianProfile, useClinicianProfile } from "@/lib/care-api";
import { logout, useRequireRole, useSession } from "@/lib/session";

export default function ClinicianProfilePage() {
  const { user, loading } = useRequireRole("clinician");
  const { refresh } = useSession();

  if (loading || !user) return <main className="min-h-screen bg-background" aria-busy="true" />;

  return (
    <Frame>
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="text-base font-semibold">{user.displayName}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </section>

      <DirectoryProfile />

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Settings2 className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Time zone and clock</h2>
        </div>
        <div className="max-w-md">
          <PreferencesForm user={user} onSaved={() => refresh()} />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Change your password</h2>
        </div>
        <div className="max-w-md">
          <PasswordForm />
        </div>
      </section>

      <Button
        variant="secondary"
        className="w-fit gap-2"
        onClick={async () => {
          await logout();
          window.location.href = "/login";
        }}
      >
        <LogOut className="size-4" /> Sign out
      </Button>
    </Frame>
  );
}

/** What patients see when they search the directory. */
function DirectoryProfile() {
  const { data: profile, mutate } = useClinicianProfile();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!profile) {
    return (
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">Loading your directory profile…</p>
      </section>
    );
  }

  // Captured after the guard above, so the closures below know it is loaded.
  const loaded = profile;
  const value = (field: string, fallback: string) => draft?.[field] ?? fallback;
  const isAccepting = accepting ?? loaded.acceptingNewPatients;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    setError(null);
    try {
      await saveClinicianProfile({
        name: value("name", loaded.name),
        role: value("role", loaded.role),
        practice: value("practice", loaded.practice),
        specialty: value("specialty", loaded.specialty),
        city: value("city", loaded.city),
        bio: value("bio", loaded.bio),
        languages: value("languages", loaded.languages.join(", "))
          .split(",")
          .map((language) => language.trim())
          .filter(Boolean),
        acceptingNewPatients: isAccepting,
      });
      await mutate();
      setState("saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save");
      setState("idle");
    }
  }

  const field = (name: string, label: string, fallback: string, placeholder = "") => (
    <div>
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <Input
        id={name}
        value={value(name, fallback)}
        placeholder={placeholder}
        onChange={(event) => { setDraft({ ...(draft ?? {}), [name]: event.target.value }); setState("idle"); }}
        className="mt-1"
      />
    </div>
  );

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Stethoscope className="size-4 text-primary" />
        <h2 className="text-base font-semibold">Your directory profile</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        This is what patients see when they search for a doctor.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          {field("name", "Name", loaded.name)}
          {field("role", "Title", loaded.role, "Preventive medicine")}
          {field("specialty", "Specialty", loaded.specialty, "Sleep medicine and circadian health")}
          {field("practice", "Clinic", loaded.practice)}
          {field("city", "City", loaded.city)}
          {field("languages", "Languages (comma separated)", loaded.languages.join(", "), "Swedish, English")}
        </div>

        <div>
          <label htmlFor="bio" className="text-sm font-medium">Short bio</label>
          <Textarea
            id="bio"
            value={value("bio", loaded.bio)}
            onChange={(event) => { setDraft({ ...(draft ?? {}), bio: event.target.value }); setState("idle"); }}
            className="mt-1 min-h-20"
            placeholder="What you work on, in one or two sentences."
          />
        </div>

        <label className="flex items-center gap-2.5 rounded-md bg-muted/60 p-3 text-sm">
          <input
            type="checkbox"
            checked={isAccepting}
            onChange={(event) => { setAccepting(event.target.checked); setState("idle"); }}
            className="size-4 accent-[var(--pm-primary)]"
          />
          <span>
            Accepting new patients
            <span className="block text-xs text-muted-foreground">
              When this is off, patients can find you but cannot send a request.
            </span>
          </span>
        </label>

        {error && <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

        <Button type="submit" disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save profile"}
        </Button>
      </form>
    </section>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5 py-6 lg:px-8">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2 gap-2">
            <Link href="/clinician">
              <ArrowLeft className="size-4" />
              Patients
            </Link>
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your account, how patients find you, and how times are shown.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
