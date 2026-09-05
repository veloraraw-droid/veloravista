const encoder = new TextEncoder();

function secret() {
  const value = process.env.INVOICE_LINK_SECRET;
  if (!value) throw new Error("INVOICE_LINK_SECRET is not configured");
  return value;
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signInvoiceId(id: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(id)));
}

export async function verifyInvoiceToken(id: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = await signInvoiceId(id);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ token.charCodeAt(index);
  return difference === 0;
}

