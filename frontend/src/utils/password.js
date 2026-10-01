const ITERATIONS = 310_000;

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  ));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") return { valid: false, needsRehash: false };

  const parts = storedHash.split("$");
  if (parts.length === 4 && parts[0] === "pbkdf2") {
    const iterations = Number(parts[1]);
    const salt = fromHex(parts[2]);
    const expected = fromHex(parts[3]);
    if (
      !Number.isSafeInteger(iterations) ||
      iterations < 100_000 ||
      iterations > 2_000_000 ||
      !salt ||
      salt.length !== 16 ||
      !expected ||
      expected.length !== 32
    ) {
      return { valid: false, needsRehash: false };
    }
    const actual = await derive(password, salt, iterations);
    return {
      valid: toHex(actual) === toHex(expected),
      needsRehash: iterations < ITERATIONS,
    };
  }

  if (!/^[0-9a-f]{64}$/i.test(storedHash)) {
    return { valid: false, needsRehash: false };
  }
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password),
  ));
  return { valid: toHex(digest) === storedHash.toLowerCase(), needsRehash: true };
}
