/** A link payload's `issued_at`: Unix seconds, bounded. */
import { asSafeInt } from "../../primitives/schema";

export const asIssuedAt = (v: unknown, p: string): number => asSafeInt(v, p, 0, 2 ** 40);
