/** A long account as its start and end. */
export const shortAccount = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
