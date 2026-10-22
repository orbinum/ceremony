/**
 * One contributor, as the browser or CLI client will act (SPEC §4.1): GitHub identity (the local
 * development header), a wallet linked by EIP-712, a session, a contribution per circuit, and the
 * attestation at the end. Each step can also be sent altered, for the attack flows.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type AttestationPayload,
  attestationTypedData,
  buildAttestationPayload,
  buildLinkPayload,
  type Chained,
  type CircuitName,
  CLAIM_HEADER,
  DEV_IDENTITY_HEADERS,
  ethersTypedData,
  type LinkPayload,
  linkTypedData,
  readMpcParams,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { contribute } from "@orbinum-ceremony/verifier";
import { Wallet } from "ethers";

const SNARKJS = join(import.meta.dirname, "..", "..", "node_modules", ".bin", "snarkjs");
const CLIENT = { name: "orbinum-ceremony-e2e", version: "0.0.0", commit: "0e2e0e2" };
/** How long one upload may take to be verified before the test gives up. */
const RESULT_TIMEOUT_MS = 10 * 60_000;

/** An answer: its status and JSON body (an `{ error: { code } }` for a refusal). */
export interface Answer {
  status: number;
  body: Record<string, any>;
}

/** What `contributeTo` uploads instead of an honest contribution. */
export interface Tamper {
  /** Flips a byte of the h_k the zkey carries (claimed accordingly): only snarkjs can refuse it. */
  flip?: boolean;
  /** Claims an output hash other than the uploaded bytes'. */
  wrongOutputHash?: boolean;
}

export class Contributor {
  readonly wallet = Wallet.createRandom();
  private heartbeat: NodeJS.Timeout | undefined;

  /** `diagnose`: what to add to a timeout (the verifier's stderr). */
  constructor(
    private readonly base: string,
    private readonly ceremonyId: string,
    readonly githubId: number,
    readonly method: "browser" | "cli",
    private readonly work: string,
    private readonly diagnose: () => string = () => "",
  ) {}

  private get login() {
    return `user-${this.githubId}`;
  }

  private get identity() {
    return {
      [DEV_IDENTITY_HEADERS.id]: String(this.githubId),
      [DEV_IDENTITY_HEADERS.login]: this.login,
    };
  }

  /** A call as this contributor; resolves with any answer. */
  async request(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Answer> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        ...this.identity,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  }

  /** A call that must succeed; returns its body. */
  async call(method: string, path: string, body?: unknown): Promise<Record<string, any>> {
    const { status, body: json } = await this.request(method, path, body);
    if (status >= 400) throw new Error(`${method} ${path}: ${status} ${JSON.stringify(json)}`);
    return json;
  }

  /** A fresh link payload for this contributor, with `change` applied. */
  async linkPayload(change: Partial<LinkPayload> = {}): Promise<LinkPayload> {
    const { nonce } = await this.call("POST", "/api/link/nonce");
    return {
      ...buildLinkPayload({
        ceremonyId: this.ceremonyId,
        githubId: this.githubId,
        githubLogin: this.login,
        account: this.wallet.address,
        nonce,
        now: Date.now(),
      }),
      ...change,
    };
  }

  /** Signs and sends a link payload; resolves with the answer. */
  async sendLink(payload: LinkPayload): Promise<Answer> {
    const signature = await this.wallet.signTypedData(...ethersTypedData(linkTypedData(payload)));
    return this.request("POST", "/api/link", { scheme: "eip712", payload, signature });
  }

  async link(): Promise<void> {
    const { status, body } = await this.sendLink(await this.linkPayload());
    if (status >= 400) throw new Error(`link: ${status} ${JSON.stringify(body)}`);
  }

  /** Joins and claims the slot; heartbeats until `end`. Returns the session's seq. */
  async start(): Promise<number> {
    await this.call("POST", "/api/queue/join");
    const me = await this.call("GET", "/api/queue/me");
    if (!me.slot) throw new Error("no slot after joining an empty queue");
    await this.call("POST", "/api/session/claim");
    // A refused heartbeat means the session ended (released or closed): stop sending them.
    this.heartbeat = setInterval(() => {
      this.call("POST", "/api/session/heartbeat").catch(() => this.end());
    }, 15_000);
    return me.slot.seq as number;
  }

  /** The current head of `circuit`, downloaded and checked against its published hash. */
  async head(circuit: CircuitName): Promise<{ sha256: string; bytes: Uint8Array }> {
    const head = await this.call("GET", `/api/session/head/${circuit}`);
    const bytes = new Uint8Array(await (await fetch(`${this.base}${head.url}`)).arrayBuffer());
    if (sha256Hex(bytes) !== head.output_sha256)
      throw new Error("the head does not match its hash");
    return { sha256: head.output_sha256, bytes };
  }

  /** Contributes on top of the head of `circuit`; returns the output and its claim. */
  async contribution(circuit: CircuitName, tamper: Tamper = {}) {
    const head = await this.head(circuit);
    const inPath = join(this.work, `${this.githubId}-${circuit}-in.zkey`);
    const outPath = join(this.work, `${this.githubId}-${circuit}-out.zkey`);
    await writeFile(inPath, head.bytes);
    const name = `contributor-${this.githubId}`;
    const entropy = `${this.githubId}-${circuit}-${crypto.randomUUID()}`;
    if (this.method === "cli") {
      // The CLI path: stock snarkjs, h_k read back from the file it wrote.
      await promisify(execFile)(SNARKJS, [
        "zkey",
        "contribute",
        inPath,
        outPath,
        `--name=${name}`,
        `-e=${entropy}`,
      ]);
    } else {
      await contribute(inPath, outPath, name, entropy);
    }
    const output = new Uint8Array(await readFile(outPath));
    // The flipped byte lies in the h_k the zkey carries; claiming the changed h_k gets the upload
    // past the pre-checks, so only snarkjs's verify can refuse it.
    if (tamper.flip) output[output.length - 100] = (output[output.length - 100] ?? 0) ^ 1;
    const claim = {
      inputSha256: head.sha256,
      outputSha256: tamper.wrongOutputHash ? "00".repeat(32) : sha256Hex(output),
      contributionHash: readMpcParams(output).entries.at(-1)?.hash as string,
      method: this.method,
      client: CLIENT,
    };
    return { output, claim };
  }

  /** Uploads `output` for `circuit` with `claim`; resolves with the answer. */
  async upload(circuit: CircuitName, output: Uint8Array, claim: unknown): Promise<Answer> {
    const upload = await fetch(`${this.base}/api/session/upload/${circuit}`, {
      method: "PUT",
      headers: { ...this.identity, [CLAIM_HEADER]: JSON.stringify(claim) },
      body: output,
    });
    return { status: upload.status, body: (await upload.json()) as Record<string, any> };
  }

  /**
   * Contributes, uploads and waits for the verifier (polls as the client does, SPEC §4.1, for
   * at most `RESULT_TIMEOUT_MS`).
   */
  async contributeTo(circuit: CircuitName, tamper: Tamper = {}): Promise<Record<string, any>> {
    const { output, claim } = await this.contribution(circuit, tamper);
    const upload = await this.upload(circuit, output, claim);
    if (upload.status !== 202) {
      throw new Error(`upload ${circuit}: ${upload.status} ${JSON.stringify(upload.body)}`);
    }
    const deadline = Date.now() + RESULT_TIMEOUT_MS;
    let result: Record<string, any> = {};
    while (Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- polls the result as the client does
      result = await this.call("GET", `/api/session/result/${circuit}`);
      if (result.status !== "pending") return result;
      // oxlint-disable-next-line no-await-in-loop -- polls the result as the client does
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
      `${circuit}: no verdict after ${RESULT_TIMEOUT_MS / 1000} s (job ${JSON.stringify(result)})\n${this.diagnose()}`,
    );
  }

  /** The attestation payload of session `seq` over `records`. */
  attestation(seq: number, records: Chained[]): AttestationPayload {
    return buildAttestationPayload({
      ceremonyId: this.ceremonyId,
      githubId: this.githubId,
      account: this.wallet.address,
      seq,
      records,
      client: CLIENT,
    });
  }

  /** Signs `payload` with `signer` (default: the linked wallet) and sends it. */
  async sendAttestation(
    payload: AttestationPayload,
    signer: Pick<Wallet, "signTypedData"> = this.wallet,
  ): Promise<Answer> {
    const signature = await signer.signTypedData(...ethersTypedData(attestationTypedData(payload)));
    return this.request("POST", "/api/session/attest", { payload, signature });
  }

  /** Signs the session's accepted records (SPEC §3.5); the coordinator then closes the session. */
  async attest(seq: number, records: Chained[]): Promise<void> {
    const { status, body } = await this.sendAttestation(this.attestation(seq, records));
    if (status >= 400) throw new Error(`attest: ${status} ${JSON.stringify(body)}`);
  }

  /** Ends the session without attesting (e.g. after a rejected upload). */
  async finish(): Promise<void> {
    await this.call("POST", "/api/session/finish");
  }

  end(): void {
    clearInterval(this.heartbeat);
  }
}
