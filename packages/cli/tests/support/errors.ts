/** The error a promise rejects with; fails the test if it resolves. */
export async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected a rejection");
}
