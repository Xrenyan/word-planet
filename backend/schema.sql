-- Apply as a deployment migration; the Worker never creates tables at runtime.
CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY NOT NULL,
  secret_hash TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vaults_expiry ON vaults(expires_at);

CREATE TABLE IF NOT EXISTS vault_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0),
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vault_rate_limits_expiry ON vault_rate_limits(reset_at);
