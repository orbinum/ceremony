/** Who is signed in and how to sign out, and the networks a ceremony site can be for. */
export interface Account {
  login: string;
  signOut: () => void;
}

export type Network = "mainnet" | "testnet";
