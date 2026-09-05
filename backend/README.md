# Encrypted backup API

Deploy `worker.ts` as a Cloudflare Worker with a D1 binding named `DB`.
Apply `schema.sql` through the deployment migration system before serving traffic.
The Worker has no package dependencies and never creates tables at runtime.
Configure a daily scheduled trigger for `scheduled()` to remove expired backup
and rate-limit rows even when there are no requests. Requests also remove expired
rows, and expiry is always enforced when reading or writing.

The API was deployed on 2026-09-05 at
`https://word-planet-sync.zhanyiqing514.chatgpt.site` with the generated
`drizzle/0000_light_wendell_vaughn.sql` migration and a `DB` D1 binding.
`.openai/hosting.json` contains a project identifier, not credentials. The source
deployment commit is `a6bc897287450a1885e923e852c8bfe3a2d76c57` in the separate
Sites release checkout. No scheduled trigger is configured there; request-time
cleanup and read/write expiry enforcement remain active. A deployment adapter
can import or bundle the Worker's default export without changing schema columns.

## Browser contract

Route: `/api/vault/:id`, where `id` is 32 lowercase hex characters.
No query parameters are accepted. Every request requires an `Origin` of
`https://xrenyan.github.io` or `http://127.0.0.1:4177`. Browser preflight permits
`Authorization`, `Content-Type`, `If-Match` and `If-None-Match`.

All operations except preflight require `Authorization: Bearer <43-character
base64url secret>`. Only the SHA-256 hash of that bearer secret is stored. Native
Web Crypto HMAC verification compares hashes without an early-return string
comparison. Missing records and incorrect credentials return the same 404 body.
Do not enable application logging of authorization headers, pairing codes or
request bodies.

| Operation | Headers | Success |
| --- | --- | --- |
| Create: PUT (or POST) | `If-None-Match: *`, `Content-Type: application/json` | 201 + metadata |
| Read: GET | Authorization | 200 + envelope and metadata |
| Update: PUT | `If-Match: "1"`, `Content-Type: application/json` | 200 + metadata with the next revision |
| Delete: DELETE | Authorization | 204, no body |

Encrypted request envelope: `{ "iv": "base64url", "ciphertext": "base64url" }`.
Exactly these two keys are accepted. The IV decodes to 12 bytes; ciphertext
includes the 16-byte AES-GCM authentication tag. Total encoded JSON request body
is limited to 1,048,576 bytes, checked while streaming even without Content-Length.

Metadata: `{ "revision": 1, "updatedAt": 1234567890000, "expiresAt": 1250119890000 }`.
Timestamps are Unix milliseconds. GET includes metadata and envelope fields at the
same object level. GET and write responses contain `ETag: "revision"`; CORS exposes
ETag and Retry-After. All responses use `Cache-Control: no-store`.

Errors are JSON `{ "error": "code" }`:

- 400: invalid input, envelope or precondition; 413: payload too large; 415: JSON required.
- 403: unapproved/missing Origin or unsupported preflight.
- 404 `not-found`: no accessible record, including absent/invalid credentials.
- 409 `revision-conflict`: the credential is valid but a create/update raced.
- 428: explicit create or update precondition required.
- 429 `rate-limited`: retry after the number of seconds in Retry-After.
- 503 `capacity-reached` or `service-unavailable`: the write did not succeed.

Creation checks capacity and inserts in one SQL statement with conflict handling.
Updates match id, secret hash and revision in one conditional SQL statement;
neither a concurrent create nor a stale update can overwrite a vault.

## Pairing and application integration

Use `src/features/sync/vaultClient.ts`; the API origin is an explicit argument.
The module exports `generatePairingCode`, `parsePairingCode`, `createVault`,
`readVault`, `updateVault`, `deleteVault` and `syncVault`.

The pairing code is `<128-bit vault id>.<256-bit random master secret>`. Keep the
whole code private. It is never sent to the API. HKDF-SHA-256 uses vault-id bytes
as salt and distinct `word-planet:v1:authorization` / `word-planet:v1:encryption`
info strings to derive a bearer secret and a non-extractable AES-256-GCM key.
Fresh 96-bit IVs and vault-specific authenticated additional data protect each
encrypted snapshot. A server or database breach cannot use the bearer secret to
derive the decryption key. The pairing secret cannot be recovered if every paired
device and saved copy is lost.

`createVault(apiOrigin, code, data)` returns metadata. `readVault<T>` returns
`{ data, revision, updatedAt, expiresAt }`. `syncVault(apiOrigin, code, local,
merge)` reads and decrypts, calls `merge(local, remote)`, and conditionally writes
the result. It re-reads/re-merges up to three times on conflicts. It skips a write
when the merged JSON is unchanged, and never silently re-creates a missing vault.
All functions accept a final `{ fetch }` argument for integration testing.

Validate decrypted application records before local import or merge; a generic
TypeScript type is not runtime validation. The application owns record selection,
event-id merging, local persistence and consent UI. Supply learning records only;
do not include child names, contact information or recordings. Nothing in this
module reads storage, selects identity data, records audio or uploads plaintext.
Requests omit cookies, reject redirects, suppress referrers and time out after ten
seconds. `VaultError` exposes `code`, `status`, and optional `retryAfter` for UI.

## Bounds for the public free service

Backups expire 180 days after their last successful write. Maximum 128 stored
vaults bounds encrypted blob storage to approximately 128 MiB plus database
overhead. There are 5 create attempts per IP/day, 100 globally/day, 60 API requests
per IP/minute, 600 globally/minute and 10,000 globally/day. Quotas use atomic SQL
counters and Cloudflare's trusted `CF-Connecting-IP`; a missing IP shares one
bucket. Only a daily IP hash is retained and expired counters are deleted.

These finite quotas can reject legitimate traffic when exhausted; the UI must
report the failure and keep local records. They are application abuse controls,
not a guarantee of platform free-tier capacity or availability.

## Verification

Run `npx vitest run backend/worker.test.ts src/features/sync/vaultClient.test.ts`
with Node 24+ (uses its built-in `node:sqlite`) and `npx tsc --noEmit`.
The adapter applies generated `drizzle/*.sql` migrations when present, otherwise
the standalone `schema.sql` draft. The tests execute real SQLite statements and Web Crypto, including pairing,
cross-device merge, racing writes, wrong credentials, tampered ciphertext,
deletion, expiry, CORS, payload bounds, rate/capacity limits and HTTP timeout.

Before pointing the public frontend at a deployment, smoke-test create → read →
update → stale-update conflict → wrong-secret rejection → delete against the
deployed URL with an allowed Origin. Use a fresh temporary code and remove that
test vault afterwards. Deployment and frontend integration are separate steps.

Protocol references: [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
and [Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey).
