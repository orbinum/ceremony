/** A drand round as a relay serves it at `GET /<chain_hash>/public/<round>`. */
export interface DrandRound {
  round: number;
  randomness: string;
  signature: string;
}
