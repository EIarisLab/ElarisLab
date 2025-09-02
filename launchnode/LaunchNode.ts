import fetch, { RequestInit, HeadersInit } from "node-fetch"

export interface LaunchConfig {
  contractName: string
  parameters: Record<string, unknown>
  deployEndpoint: string
  apiKey?: string
  /** Number of retry attempts on failure (default: 3) */
  retries?: number
  /** Request timeout in milliseconds (default: 10_000) */
  timeoutMs?: number
  /** Optional static headers merged into the request */
  headers?: Record<string, string>
  /** Linear backoff base in ms (attempt N waits N * backoffBaseMs) */
  backoffBaseMs?: number
  /** Optional idempotency key header value */
  idempotencyKey?: string
  /** If the deploy returns 202 + Location, poll this endpoint */
  statusPollMs?: number
  /** Maximum polls for a pending deployment (default: retries) */
  statusMaxPolls?: number
  /** Optional deterministic user agent string */
  userAgent?: string
}

export interface LaunchResult {
  success: boolean
  address?: string
  transactionHash?: string
  error?: string
  attempts: number
  status?: number
  raw?: unknown
}

type JsonLike = Record<string, unknown> | unknown[] | string | number | boolean | null

export class LaunchNode {
  private readonly retries: number
  private readonly timeoutMs: number
  private readonly backoffBaseMs: number
  private readonly statusPollMs: number
  private readonly statusMaxPolls: number

  constructor(private config: LaunchConfig) {
    const { contractName, deployEndpoint, parameters } = config
    if (!contractName || !contractName.trim()) throw new Error("contractName is required")
    if (!deployEndpoint || !deployEndpoint.trim()) throw new Error("deployEndpoint is required")
    this.assertUrl(deployEndpoint)
    if (parameters == null || typeof parameters !== "object" || Array.isArray(parameters)) {
      throw new Error("parameters must be a plain object")
    }

    this.retries = Number.isInteger(config.retries) && (config.retries as number) >= 0 ? (config.retries as number) : 3
    this.timeoutMs = Number.isInteger(config.timeoutMs) && (config.timeoutMs as number) > 0 ? (config.timeoutMs as number) : 10_000
    this.backoffBaseMs = Math.max(0, config.backoffBaseMs ?? 300)
    this.statusPollMs = Math.max(250, config.statusPollMs ?? 1_000)
    this.statusMaxPolls = Math.max(0, config.statusMaxPolls ?? this.retries)
  }

  private assertUrl(u: string): void {
    const url = new URL(u)
    if (!/^https?:$/.test(url.protocol)) {
      throw new Error(`deployEndpoint must be http(s), got ${url.protocol}`)
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeout: number): Promise<Response> {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(id)
    }
  }

  private redactSecrets<T extends string | undefined>(val: T): T | string | undefined {
    if (!val) return val
    return val.length <= 8 ? "***" : `${val.slice(0, 4)}***${val.slice(-4)}`
  }

  /** Parse JSON safely; fall back to text if invalid */
  private async parseBody(res: Response): Promise<unknown> {
    const text = await res.text()
    try {
      return text ? JSON.parse(text) : null
    } catch {
      return text
    }
  }

  /** Retry policy: which HTTP statuses should be retried */
  private isRetryableStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500
  }

  private buildHeaders(): HeadersInit {
    const { apiKey, headers, idempotencyKey, userAgent } = this.config
    return {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain;q=0.8",
      ...(userAgent ? { "User-Agent": userAgent } : {}),
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(headers ?? {}),
    }
  }

  private buildBody(): string {
    const { contractName, parameters } = this.config
    // Replace undefined with null to avoid dropping keys in JSON
    const replacer = (_k: string, v: unknown) => (v === undefined ? null : v)
    const payload: JsonLike = { contractName, parameters }
    return JSON.stringify(payload, replacer)
  }

  private extractSuccessFields(body: unknown): { address?: string; txHash?: string } {
    const b: any = body
    return {
      address: b?.contractAddress ?? b?.address ?? b?.result?.address ?? undefined,
      txHash: b?.txHash ?? b?.transactionHash ?? b?.result?.txHash ?? undefined,
    }
  }

  /**
   * Optionally poll a status endpoint returned by 202 Accepted responses
   * Expects Location header to point to a JSON resource with terminal fields
   */
  private async pollStatus(location: string): Promise<{ ok: boolean; body?: unknown; status?: number }> {
    this.assertUrl(location)
    let polls = 0
    while (polls < this.statusMaxPolls) {
      polls++
      const res = await this.fetchWithTimeout(
        location,
        {
          method: "GET",
          headers: {
            ...this.buildHeaders(),
          },
        },
        this.timeoutMs
      )
      const body = await this.parseBody(res)
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, body, status: res.status }
      }
      if (res.status !== 202) {
        return { ok: false, body, status: res.status }
      }
      await this.sleep(this.statusPollMs)
    }
    return { ok: false, status: 408, body: { error: "status polling timeout" } }
  }

  /**
   * Deploy the contract with deterministic linear backoff and idempotent header support
   */
  public async deploy(): Promise<LaunchResult> {
    const { deployEndpoint, idempotencyKey, apiKey } = this.config
    let attempt = 0
    let lastError: string | undefined
    let lastStatus: number | undefined
    let lastRaw: unknown

    const initBase: RequestInit = {
      method: "POST",
      headers: this.buildHeaders(),
      body: this.buildBody(),
    }

    while (attempt <= this.retries) {
      attempt++
      try {
        const res = await this.fetchWithTimeout(deployEndpoint, initBase, this.timeoutMs)
        lastStatus = res.status
        const body = await this.parseBody(res)
        lastRaw = body

        // 2xx → success
        if (res.ok) {
          const { address, txHash } = this.extractSuccessFields(body)
          return {
            success: true,
            address,
            transactionHash: txHash,
            attempts: attempt,
            status: res.status,
            raw: body,
          }
        }

        // 202 with Location → poll status endpoint
        if (res.status === 202) {
          const location = res.headers.get("location") || res.headers.get("Location")
          if (location) {
            const polled = await this.pollStatus(location)
            lastStatus = polled.status
            lastRaw = polled.body
            if (polled.ok) {
              const { address, txHash } = this.extractSuccessFields(polled.body)
              return {
                success: true,
                address,
                transactionHash: txHash,
                attempts: attempt,
                status: polled.status,
                raw: polled.body,
              }
            }
          }
        }

        // Non-2xx, construct deterministic error
        const bodyText =
          typeof body === "string" ? body : body ? JSON.stringify(body) : ""
        lastError = `HTTP ${res.status}${bodyText ? `: ${bodyText}` : ""}`

        // Stop if non-retryable or budget exhausted
        if (!this.isRetryableStatus(res.status) || attempt > this.retries) {
          return {
            success: false,
            error: lastError,
            attempts: attempt,
            status: res.status,
            raw: body,
          }
        }

        // Honor Retry-After seconds when present on 429/5xx
        const retryAfter = Number(res.headers.get("retry-after"))
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.round(retryAfter * 1000)
            : this.backoffBaseMs * attempt
        await this.sleep(waitMs)
      } catch (err: any) {
        lastError =
          err?.name === "AbortError"
            ? `request timed out after ${this.timeoutMs}ms`
            : err?.message ?? String(err)

        if (attempt > this.retries) break
        const waitMs = this.backoffBaseMs * attempt
        await this.sleep(waitMs)
      }
    }

    // Final failure
    const redactedKey = this.redactSecrets(idempotencyKey)
    const redactedApi = this.redactSecrets(apiKey)
    return {
      success: false,
      error: `${lastError ?? "deployment failed"} [idempotencyKey=${redactedKey}] [apiKey=${redactedApi}]`,
      attempts: attempt,
      status: lastStatus,
      raw: lastRaw,
    }
  }
}
