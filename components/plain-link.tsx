import * as React from "react";

/*
 * A drop-in replacement for `next/link` that renders an ordinary anchor.
 *
 * Client-side navigation into dynamic routes (`/clinician/[patientId]`) does not
 * work reliably under vinext — the clinician roster's "Open" buttons did nothing
 * and the record could only be reached by typing the URL. See issue #14.
 *
 * The cost is real: every in-app navigation is now a full page load, so the SWR
 * cache is discarded and refetched. That is the trade we accept until the routing
 * bug is fixed upstream; an eslint rule blocks `next/link` so this cannot silently
 * regress. The next/link props below are accepted and ignored so call sites did
 * not have to change.
 */

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string>; hash?: string };
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
};

export default function Link({
  href,
  // Accepted for API compatibility; an anchor has no use for them, and spreading
  // them onto the DOM node would make React complain about unknown attributes.
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  children,
  ...rest
}: Props) {
  let url = "/";
  if (typeof href === "string") {
    url = href;
  } else if (href && typeof href === "object") {
    url = href.pathname ?? "/";
    if (href.query) {
      const qs = new URLSearchParams(href.query).toString();
      if (qs) url += `?${qs}`;
    }
    if (href.hash) url += href.hash.startsWith("#") ? href.hash : `#${href.hash}`;
  }
  return (
    <a href={url} {...rest}>
      {children}
    </a>
  );
}
