/**
 * What a call to the coordinator needs: its origin, the shared key, and the ceremony the MAC binds.
 */
import type { ServiceConfig } from "../config";

export type Endpoint = Pick<ServiceConfig, "coordinatorUrl" | "hmacKey"> & { ceremonyId: string };
