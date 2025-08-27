export interface SigningEngineKeyPair {
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
}

export interface SigningEngineOptions {
  /** RSA modulus length in bits */
  modulusLength?: 2048 | 3072 | 4096
  /** Hash function for RSASSA-PKCS1-v1_5 */
  hash?: "SHA-256" | "SHA-384" | "SHA-512"
  /** Whether keys can be exported */
  extractable?: boolean
  /** Inject a specific SubtleCrypto impl (useful for Node) */
  subtle?: SubtleCrypto
}

type SignAlgo = {
  name: "RSASSA-PKCS1-v1_5"
  hash: "SHA-256" | "SHA-384" | "SHA-512"
}

export class SigningEngine {
  private keyPair: CryptoKeyPair
  private readonly algo: SignAlgo
  private readonly subtle: SubtleCrypto

  private constructor(keyPair: CryptoKeyPair, algo: SignAlgo, subtle: SubtleCrypto) {
    this.keyPair = keyPair
    this.algo = algo
    this.subtle = subtle
  }

  /**
   * Create a SigningEngine with a freshly generated RSA keypair
   */
  public static async create(opts: SigningEngineOptions = {}): Promise<SigningEngine> {
    const subtle = opts.subtle ?? getSubtleOrThrow()
    const algo: SignAlgo = { name: "RSASSA-PKCS1-v1_5", hash: opts.hash ?? "SHA-256" }
    const keyPair = await subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: opts.modulusLength ?? 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: algo.hash,
      },
      opts.extractable ?? true,
      ["sign", "verify"]
    )
    return new SigningEngine(keyPair, algo, subtle)
  }

  /**
   * Restore from a JWK keypair
   */
  public static async fromJwk(jwkPair: SigningEngineKeyPair, opts: SigningEngineOptions = {}): Promise<SigningEngine> {
    const subtle = opts.subtle ?? getSubtleOrThrow()
    const algo: SignAlgo = { name: "RSASSA-PKCS1-v1_5", hash: opts.hash ?? ("alg" in jwkPair.publicKeyJwk && typeof jwkPair.publicKeyJwk.alg === "string" && jwkPair.publicKeyJwk.alg.includes("512")
      ? "SHA-512"
      : "SHA-256") }

    const privateKey = await subtle.importKey(
      "jwk",
      jwkPair.privateKeyJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: algo.hash },
      opts.extractable ?? true,
      ["sign"]
    )
    const publicKey = await subtle.importKey(
      "jwk",
      jwkPair.publicKeyJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: algo.hash },
      true,
      ["verify"]
    )
    return new SigningEngine({ publicKey, privateKey }, algo, subtle)
  }

  /**
   * Export current keys as JWK
   */
  public async exportJwk(): Promise<SigningEngineKeyPair> {
    const publicKeyJwk = (await this.subtle.exportKey("jwk", this.keyPair.publicKey)) as JsonWebKey
    const privateKeyJwk = (await this.subtle.exportKey("jwk", this.keyPair.privateKey)) as JsonWebKey
    return { publicKeyJwk, privateKeyJwk }
  }

  /**
   * Sign a UTF-8 string; returns Base64 by default, Base64URL if urlSafe=true
   */
  public async sign(data: string, urlSafe = false): Promise<string> {
    const bytes = new TextEncoder().encode(data)
    const sig = await this.subtle.sign(this.algo, this.keyPair.privateKey, bytes)
    return urlSafe ? toBase64Url(new Uint8Array(sig)) : toBase64(new Uint8Array(sig))
  }

  /**
   * Verify a signature over a UTF-8 string; accepts Base64 or Base64URL
   */
  public async verify(data: string, signatureB64: string): Promise<boolean> {
    const bytes = new TextEncoder().encode(data)
    const sigBytes = fromBase64Either(signatureB64)
    return this.subtle.verify(this.algo, this.keyPair.publicKey, sigBytes, bytes)
  }

  /**
   * Sign raw bytes; returns Uint8Array signature
   */
  public async signBytes(data: Uint8Array): Promise<Uint8Array> {
    const sig = await this.subtle.sign(this.algo, this.keyPair.privateKey, data)
    return new Uint8Array(sig)
  }

  /**
   * Verify signature over raw bytes
   */
  public async verifyBytes(data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    return this.subtle.verify(this.algo, this.keyPair.publicKey, signature, data)
  }
}

/* -------------------- helpers -------------------- */

function getSubtleOrThrow(): SubtleCrypto {
  const g: any = globalThis as any
  if (g.crypto?.subtle) return g.crypto.subtle
  // Node.js (>= v16.5) webcrypto
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const node = require("node:crypto")
    if (node?.webcrypto?.subtle) return node.webcrypto.subtle
  } catch {
    /* noop */
  }
  throw new Error("SubtleCrypto is not available in this runtime. Provide it via options.subtle")
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64")
  }
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  // @ts-ignore
  return btoa(binary)
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"))
  }
  // @ts-ignore
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function fromBase64Url(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 2 ? "==" : b64url.length % 4 === 3 ? "=" : ""
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + pad
  return fromBase64(b64)
}

function fromBase64Either(inp: string): Uint8Array {
  return /[-_]/.test(inp) ? fromBase64Url(inp) : fromBase64(inp)
}
