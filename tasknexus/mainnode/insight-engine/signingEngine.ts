export interface SigningEngineKeyPair {
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
}

export class SigningEngine {
  private keyPair: CryptoKeyPair

  private constructor(keyPair: CryptoKeyPair) {
    this.keyPair = keyPair
  }

  /**
   * Asynchronously creates a new SigningEngine with a generated RSA key pair.
   */
  public static async create(): Promise<SigningEngine> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true, // extractable
      ["sign", "verify"]
    )
    return new SigningEngine(keyPair)
  }

  /**
   * Optionally, import an existing JWK key pair.
   */
  public static async fromJwk(jwkPair: SigningEngineKeyPair): Promise<SigningEngine> {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      jwkPair.privateKeyJwk,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      true,
      ["sign"]
    )
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwkPair.publicKeyJwk,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      true,
      ["verify"]
    )
    return new SigningEngine({ publicKey, privateKey })
  }

  /**
   * Exports the current key pair as JWK for storage or transport.
   */
  public async exportJwk(): Promise<SigningEngineKeyPair> {
    const publicKeyJwk = (await crypto.subtle.exportKey("jwk", this.keyPair.publicKey)) as JsonWebKey
    const privateKeyJwk = (await crypto.subtle.exportKey("jwk", this.keyPair.privateKey)) as JsonWebKey
    return { publicKeyJwk, privateKeyJwk }
  }

  /**
   * Signs a UTF‑8 string and returns a Base64 signature.
   */
  public async sign(data: string): Promise<string> {
    const encoder = new TextEncoder()
    const signature = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      this.keyPair.privateKey,
      encoder.encode(data)
    )
    // Convert ArrayBuffer to Base64
    const bytes = new Uint8Array(signature)
    const binary = Array.from(bytes, b => String.fromCharCode(b)).join("")
    return btoa(binary)
  }

  /**
   * Verifies a Base64 signature over the given data string.
   */
  public async verify(data: string, signatureB64: string): Promise<boolean> {
    const encoder = new TextEncoder()
    const dataBytes = encoder.encode(data)
    // Convert Base64 to ArrayBuffer
    const binary = atob(signatureB64)
    const sigBytes = new Uint8Array(binary.split("").map(c => c.charCodeAt(0)))
    return crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      this.keyPair.publicKey,
      sigBytes,
      dataBytes
    )
  }
}
