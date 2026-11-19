// The few class lists every page shares: one look for a button, a field and a notice, so the screens stay alike.
export const ui = {
  button:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-paper px-4 py-2 font-medium text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50",
  danger:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-danger px-4 py-2 font-medium text-danger hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50",
  icon: "inline-flex size-11 items-center justify-center rounded-lg border border-line bg-paper text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40",
  label: "block text-sm font-medium",
  hint: "mt-1 block text-sm text-muted",
  input: "mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink",
  problem: "flex items-start gap-2 rounded-lg border border-danger p-3 text-danger",
  status: "flex items-center gap-2 text-sm text-muted",
  h1: "text-2xl font-semibold tracking-tight",
  h2: "text-lg font-semibold",
  iconSize: "size-4 shrink-0",
} as const;
