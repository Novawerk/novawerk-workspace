// The real Google verifier, exercised offline against a locally generated key set.

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { createGoogleVerifier } from "../src/auth.js";
import type { GoogleVerifier } from "../src/types.js";

const CLIENT_ID = "admin-panel.apps.googleusercontent.com";
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let verify: GoogleVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256" };
  verify = createGoogleVerifier(CLIENT_ID, createLocalJWKSet({ keys: [jwk] }));
});

function token(claims: JWTPayload, opts: { exp?: string | number } = {}) {
  return new SignJWT({ email: "Ada@Novawerk.io", email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer((claims.iss as string | undefined) ?? "https://accounts.google.com")
    .setAudience((claims.aud as string | undefined) ?? CLIENT_ID)
    .setSubject("1234567890")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(privateKey);
}

describe("createGoogleVerifier", () => {
  it("accepts a valid token from either Google issuer and lowercases the email", async () => {
    expect(await verify(await token({}))).toEqual({ email: "ada@novawerk.io", sub: "1234567890" });
    expect((await verify(await token({ iss: "accounts.google.com" }))).email).toBe("ada@novawerk.io");
  });

  it("rejects another audience, another issuer and expired tokens", async () => {
    await expect(verify(await token({ aud: "someone-else" }))).rejects.toThrow();
    await expect(verify(await token({ iss: "https://evil.example" }))).rejects.toThrow();
    await expect(verify(await token({}, { exp: Math.floor(Date.now() / 1000) - 3600 }))).rejects.toThrow();
  });

  it("rejects an unverified email", async () => {
    await expect(verify(await token({ email_verified: false }))).rejects.toThrow(/verified email/);
  });

  it("rejects a token signed with an unknown key", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "ada@novawerk.io", email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://accounts.google.com")
      .setAudience(CLIENT_ID)
      .setExpirationTime("1h")
      .sign(other.privateKey);
    await expect(verify(forged)).rejects.toThrow();
  });
});
