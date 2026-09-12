import { Server } from "lucide-react";
import { Card } from "./ui";

/**
 * Messages, doctors and appointments are shared between two people, so they only
 * exist when the backend is running. The offline demo keeps working without them.
 */
export function NeedsBackend({ feature }: { feature: string }) {
  return (
    <Card className="flex gap-3">
      <Server aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
      <div>
        <p className="font-semibold">{feature} needs the backend</p>
        <p className="mt-1 text-sm text-ink-secondary">
          This part of the app is shared with your doctor, so it runs against the server. Start the API and set
          <code className="mx-1 rounded bg-surface-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=http</code>
          to use it.
        </p>
      </div>
    </Card>
  );
}
