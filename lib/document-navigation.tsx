"use client";
import type { AnchorHTMLAttributes } from "react";

// All routes render the same marketplace client and load their data from /api.
// Native document navigation also works before hydration and avoids Vinext's
// broken production RSC navigation/prefetch exports in the current release.
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
const router = {
  push(href: string) {
    window.location.assign(href);
  },
  replace(href: string) {
    window.location.replace(href);
  },
};
export function useRouter() {
  return router;
}
