/**
 * What the contributor's page says in more than one place: the notice before the operator
 * publishes the ceremony (nobody can sign in then: its admission rules come with it), the five
 * steps' titles and what each one is, and the ceremony in Orbinum's documentation (the
 * contributor's guide, then how it works inside).
 */
export const NOT_ANNOUNCED =
  "The ceremony has not been announced yet. Sign-in opens once it is; check back soon.";

export const STEP_TITLES = [
  "Sign in with GitHub",
  "Link a wallet",
  "Join the line",
  "Contribute",
  "Sign and get your receipt",
] as const;

export const STEP_ABOUT = [
  "Your GitHub account keeps the line fair: one contribution per person.",
  "It signs your contribution. No transaction, no fee.",
  "One contributor at a time; you wait your turn on this page.",
  "Your browser adds its randomness to every circuit of the ceremony. A few minutes.",
  "Your wallet signs what you contributed, for the public record.",
] as const;

export const DOCS = [
  { href: "https://docs.orbinum.network/ceremony/contribute", label: "Contributor guide" },
  {
    href: "https://docs.orbinum.network/architecture/trusted-setup",
    label: "How the ceremony works",
  },
] as const;
