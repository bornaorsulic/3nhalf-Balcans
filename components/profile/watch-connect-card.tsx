"use client";

import { useState } from "react";
import { Watch, Wifi, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const PROVIDERS = ["Apple Watch", "Garmin", "Oura Ring", "Fitbit", "Manual import"];

function storageKey(userId: string) {
  return `watch-connection:${userId}`;
}

export function WatchConnectCard({ userId }: { userId: string }) {
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [connected, setConnected] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(storageKey(userId));
    } catch {
      return null;
    }
  });

  function connect() {
    setConnected(provider);
    try {
      localStorage.setItem(storageKey(userId), provider);
    } catch {
      // The visible state still updates for this session.
    }
  }

  function disconnect() {
    setConnected(null);
    try {
      localStorage.removeItem(storageKey(userId));
    } catch {
      // Nothing else to do.
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Watch className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Wearable connection</p>
          <p className="text-sm text-muted-foreground">
            Connect a watch or ring so sleep, HRV, resting heart rate and steps can sync into the app.
          </p>
        </div>
      </div>

      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/50 p-3">
          <p className="flex items-center gap-2 text-sm">
            <Wifi className="size-4 text-primary" />
            <span>
              <span className="font-medium">{connected}</span> connected
              <span className="block text-xs text-muted-foreground">Prototype connection. Real device sync can be wired to this setting later.</span>
            </span>
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={disconnect} className="gap-2">
            <X className="size-4" />
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor={`watch-provider-${userId}`} className="text-sm font-medium">
              Device
            </label>
            <select
              id={`watch-provider-${userId}`}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="mt-1 h-10 w-full rounded-control border border-line bg-card px-2 text-sm"
            >
              {PROVIDERS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={connect} className="gap-2">
            <Wifi className="size-4" />
            Connect
          </Button>
        </div>
      )}
    </div>
  );
}
