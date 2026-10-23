// OAuth 2.1 for the MCP server (see lib/mcp.ts), so an AI client connects
// to https://nootle.ai/mcp and each person signs in with their own Nootle
// connector key. In a Claude Team or Enterprise workspace, an owner adds the
// connector once and every member connects to their own meetings.
//
// nootle.ai has no accounts and keeps no OAuth state: client ids, codes and
// tokens are sealed (AES-256-GCM) with a server secret, and each code and
// token carries the person's connector key inside. So, as with a connector
// link, the AI client holds the key and nootle.ai never stores it; it opens
// a token only while answering that client's request.

import { createCipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { openSealed } from "@/lib/shares";

/** How long each sealed thing is good for, in seconds. Client ids never expire. */
const LIFETIME = {
  /** A sign-in in progress, between the authorize page and its form. */
  authorize: 30 * 60,
  code: 5 * 60,
  access: 60 * 60,
  refresh: 90 * 24 * 60 * 60,
} as const;

/** The MCP server's path; tokens are issued for it. */
const MCP_PATH = "/mcp";
/** Characters in a base64url 12-byte IV, which starts every sealed string. */
const IV_CHARS = 16;

type Kind = "client" | keyof typeof LIFETIME;

let secret: Buffer | undefined;

/**
 * The key everything here is sealed with: `OAUTH_SECRET`, or else one derived
 * from the Blob token so a deploy works without extra setup. Changing either
 * signs everyone out of their AI clients, who then sign in again.
 */
function serverKey(): Buffer {
  const material = process.env.OAUTH_SECRET ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!material) throw new Error("Set OAUTH_SECRET to sign AI clients in");
  secret ??= Buffer.from(hkdfSync("sha256", material, "nootle", "oauth", 32));
  return secret;
}

/** Seals `payload` as a `kind`, which it can only be opened as: the IV, then the ciphertext. */
function seal(kind: Kind, payload: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", serverKey(), iv).setAAD(Buffer.from(kind));
  const body = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]);
  return iv.toString("base64url") + body.toString("base64url");
}

function open<T>(kind: Kind, sealed: unknown): T | null {
  if (typeof sealed !== "string" || !/^[A-Za-z0-9_-]{40,}$/.test(sealed)) return null;
  const plain = openSealed({ iv: sealed.slice(0, IV_CHARS), ciphertext: sealed.slice(IV_CHARS) }, serverKey(), kind);
  if (plain === null) return null;
  const payload = JSON.parse(plain) as T & { exp?: number };
  return payload.exp !== undefined && payload.exp < Date.now() / 1000 ? null : payload;
}

const expiring = (kind: keyof typeof LIFETIME, payload: object) =>
  seal(kind, { ...payload, exp: Math.floor(Date.now() / 1000) + LIFETIME[kind] });

// --- Discovery ---

export const protectedResourceMetadata = (origin: string) => ({
  resource: origin + MCP_PATH,
  authorization_servers: [origin],
  bearer_methods_supported: ["header"],
  resource_name: "Nootle shared meetings",
});

export const authorizationServerMetadata = (origin: string) => ({
  issuer: origin,
  authorization_endpoint: `${origin}/oauth/authorize`,
  token_endpoint: `${origin}/api/oauth/token`,
  registration_endpoint: `${origin}/api/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
});

/** What the MCP server answers a request without a valid token, pointing the client at sign-in. */
export const challenge = (origin: string) =>
  `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${MCP_PATH}"`;

// --- Clients ---

interface Client {
  name: string;
  redirect_uris: string[];
}

const isRedirectUri = (uri: unknown): uri is string => {
  if (typeof uri !== "string") return false;
  try {
    const { protocol, hostname } = new URL(uri);
    // https anywhere; http only back to this machine, for desktop clients.
    return protocol === "https:" || (protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname));
  } catch {
    return false;
  }
};

/** Dynamic client registration (RFC 7591): the client id holds its own redirect URIs. */
export function registerClient(body: unknown): object | { error: string; error_description: string } {
  const { redirect_uris, client_name } = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0 || !redirect_uris.every(isRedirectUri)) {
    return { error: "invalid_redirect_uri", error_description: "Give https redirect_uris (http only for localhost)" };
  }
  const client: Client = { name: typeof client_name === "string" ? client_name.slice(0, 100) : "", redirect_uris };
  return {
    client_id: seal("client", client),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: client.name || undefined,
    redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

/** The registered client's name, if `client_id` may send people back to `redirect_uri`. */
export function checkClient(clientId: unknown, redirectUri: unknown): { name: string } | null {
  const client = open<Client>("client", clientId);
  return client && typeof redirectUri === "string" && client.redirect_uris.includes(redirectUri) ? client : null;
}

// --- Authorization ---

/** A validated sign-in request, carried sealed from the authorize page to its form's target. */
export interface AuthorizeRequest {
  client_id: string;
  /** The client's name, to show. */
  client_name: string;
  redirect_uri: string;
  code_challenge: string;
  state?: string;
}

/**
 * The sign-in request on the authorize page: OAuth's query parameters, or
 * `request`, the sealed one a failed attempt comes back with. A string says what's wrong.
 */
export function parseAuthorizeRequest(params: Record<string, string | undefined>): AuthorizeRequest | string {
  if (params.request) return openAuthorizeRequest(params.request) ?? "This sign-in took too long.";
  const { response_type, client_id, redirect_uri, code_challenge, code_challenge_method, state } = params;
  const client = checkClient(client_id, redirect_uri);
  if (!client) return "This app isn't registered with Nootle, or sent you to the wrong place.";
  if (response_type !== "code") return "This app asked for a kind of sign-in Nootle doesn't support.";
  if (code_challenge_method !== "S256" || !code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge)) {
    return "This app didn't secure its sign-in request (PKCE S256 is required).";
  }
  return { client_id: client_id!, client_name: client.name, redirect_uri: redirect_uri!, code_challenge, state };
}

export const sealAuthorizeRequest = (request: AuthorizeRequest) => expiring("authorize", request);
export const openAuthorizeRequest = (sealed: unknown) => open<AuthorizeRequest>("authorize", sealed);

/** A connector link or key, as pasted, → `<id>.<key>`. */
export function parseConnectorKey(input: string): string {
  return input.trim().split(/[/#?]/).filter(Boolean).pop() ?? "";
}

/** Where to send the person back to once they've signed in with `credential`. */
export function approve(request: AuthorizeRequest, credential: string, origin: string): string {
  const code = expiring("code", { ...request, credential });
  const target = new URL(request.redirect_uri);
  target.searchParams.set("code", code);
  if (request.state) target.searchParams.set("state", request.state);
  target.searchParams.set("iss", origin);
  return target.toString();
}

// --- Tokens ---

interface Grant {
  credential: string;
  client_id: string;
}

type TokenError = { error: string; error_description?: string };

function tokens({ credential, client_id }: Grant) {
  return {
    access_token: expiring("access", { credential }),
    token_type: "Bearer",
    expires_in: LIFETIME.access,
    refresh_token: expiring("refresh", { credential, client_id }),
  };
}

/** The token endpoint, for an `authorization_code` or `refresh_token` grant. */
export function exchange(form: URLSearchParams): ReturnType<typeof tokens> | TokenError {
  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") {
    const code = open<AuthorizeRequest & { credential: string }>("code", form.get("code"));
    const verifier = form.get("code_verifier") ?? "";
    if (
      !code ||
      code.client_id !== form.get("client_id") ||
      code.redirect_uri !== form.get("redirect_uri") ||
      createHash("sha256").update(verifier).digest("base64url") !== code.code_challenge
    ) {
      return { error: "invalid_grant", error_description: "The code is wrong, expired, or not this client's" };
    }
    return tokens(code);
  }
  if (grantType === "refresh_token") {
    const grant = open<Grant>("refresh", form.get("refresh_token"));
    const clientId = form.get("client_id");
    if (!grant || (clientId && clientId !== grant.client_id)) {
      return { error: "invalid_grant", error_description: "Sign in again" };
    }
    return tokens(grant);
  }
  return { error: "unsupported_grant_type" };
}

/**
 * The connector credential a bearer token carries: an access token's, or else
 * the token taken as a bare `<id>.<key>` (for clients without OAuth).
 * Null when it's neither; a bare credential is checked when it's used.
 */
export const credentialFromBearer = (token: string) =>
  open<{ credential: string }>("access", token)?.credential ?? (token.includes(".") ? token : null);
