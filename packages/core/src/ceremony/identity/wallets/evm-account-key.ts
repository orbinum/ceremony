/** The form under which one EVM key is unique: case is not part of an address. */
export const evmAccountKey = (account: string): string => account.toLowerCase();
