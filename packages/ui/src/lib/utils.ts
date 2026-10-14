// `cn()` merges class names: clsx-style conditionals, then Tailwind conflict resolution
// (later utilities win). shadcn's base-vega registry imports it from the `cn` package
// (shadcn's compiled drop-in for clsx + tailwind-merge); we re-export the same function
// here so registry components, our composites and the apps all share one implementation.
export { cn } from "cn"
export type { ClassValue } from "cn"
