// LaunchNode.ts (improved)

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

export class LaunchNode {
  private readonly retries: number
  private readonly timeoutMs: number
  private readonly backoffBaseMs: number

  constructor(private config: LaunchConfig) {
    const { contractName, deployEndpoint, parameters } = config
    if (!contractName) throw new Error("contractName is required")
    if (!deployEndpoint) throw new Error("deployEndpoint is required")
    if (parameters == null || typeof parameters !== "object" || Array.isArray(parameters)) {
      throw new Error("parameters must be a plain object")
    }

    this.retries = config.retries ?? 3
    if (!Number.isInteger(this.retries) || this.retries < 0) {
      throw new RangeError(`retries must be a non-negative integer, got ${this.retries}`)
    }

    this.timeoutMs = config.timeoutMs ?? 10_000
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError(`timeoutMs must be a positive integer, got ${this.timeoutMs}`)
    }

    this.backoffBaseMs = Math.max(0, config.backoffBaseMs ?? 300)
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
    return (
      status === 408 || // Request Timeout
      status === 425 || // Too Early
      status === 429 || // Too Many Requests
      status >= 500 // Server errors
    )
  }

  private buildHeaders(): HeadersInit {
    const { apiKey, headers, idempotencyKey } = this.config
    return {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(headers ?? {}),
    }
  }

  private buildBody(): string {
    const { contractName, parameters } = this.config
    return JSON.stringify({ contractName, parameters })
  }

  /**
   * Deploy the contract with deterministic linear backoff and idempotent header support
   */
  public async deploy(): Promise<LaunchResult> {
    const { deployEndpoint } = this.config
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

        if (res.ok) {
          const json = body as any
          return {
            success: true,
            address: json?.contractAddress ?? json?.address ?? undefined,
            transactionHash: json?.txHash ?? json?.transactionHash ?? undefined,
            attempts: attempt,
            status: res.status,
            raw: body,
          }
        }

        // Non-2xx
        lastError = `HTTP ${res.status}${body ? `: ${typeof body === "string" ? body : JSON.stringify(body)}` : ""}`
        if (!this.isRetryableStatus(res.status) || attempt > this.retries) {
          return { success: false, error: lastError, attempts: attempt, status: res.status, raw: body }
        }

        // Honor Retry-After seconds when present on 429/5xx
        const retryAfter = Number(res.headers.get("retry-after"))
        const waitMs = Number.isFinite(retryAfter) && retryAfter! > 0
          ? Math.round(retryAfter! * 1000)
          : this.backoffBaseMs * attempt
        await new Promise(r => setTimeout(r, waitMs))
      } catch (err: any) {
        lastError =
          err?.name === "AbortError"
            ? `Request timed out after ${this.timeoutMs}ms`
            : (err?.message ?? String(err))

        if (attempt > this.retries) break
        const waitMs = this.backoffBaseMs * attempt
        await new Promise(r => setTimeout(r, waitMs))
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: attempt,
      status: lastStatus,
      raw: lastRaw,
    }
  }
}
