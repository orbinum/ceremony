/**
 * The Durable Object's SQLite schema, created idempotently when the object starts. Every table is
 * written only by CeremonyDO.
 */
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS setup (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS queue_state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS identities (
    github_id INTEGER PRIMARY KEY,
    login TEXT NOT NULL,
    scheme TEXT NOT NULL,
    account TEXT NOT NULL,
    account_key TEXT NOT NULL UNIQUE,
    signature TEXT NOT NULL,
    nonce TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    linked_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS nonces (
    nonce TEXT PRIMARY KEY,
    github_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS spent (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS holds (id TEXT PRIMARY KEY, key TEXT NOT NULL, until INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS jobs (
    seq INTEGER NOT NULL,
    circuit TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    github_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (seq, circuit, attempt)
  );
  CREATE TABLE IF NOT EXISTS records (n INTEGER PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS published (key TEXT PRIMARY KEY, version TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS finals (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
`;
