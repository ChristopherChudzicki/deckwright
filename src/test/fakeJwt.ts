// Forges an unsigned JWT for tests. supabase-js doesn't verify signatures
// when reading sessions from storage, so a fake one with valid base64
// header/payload and a future `exp` claim is accepted.
export function makeFakeJwt(claims: Record<string, unknown>): string {
  const b64url = (s: string) => btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  return `${header}.${payload}.fake-signature`;
}
