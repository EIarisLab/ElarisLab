// LaunchNode.ts

import fetch, { RequestInit } from "node-fetch"

export interface LaunchConfig {
  contractName: string
  parameters: Record<string, unknown>
  deployEndpoint: string
  apiKey?: string
  /** Number of retry attempts on failure (default: 3) */
  retries?: number
  /** Request timeout in milliseconds (default: 10_000) */
  timeoutMs?: number
}

export interface LaunchResult {
  success: boolean
  address?: string
  transactionHash?: string
  error?: string
  attempts: number
}

export class LaunchNode {
  private readonly retries: number
  private readonly timeoutMs: number

  constructor(private config: LaunchConfig) {
    const { contractName, deployEndpoint, parameters } = config
    if (!contractName) throw new Error("contractName is required")
    if (!deployEndpoint) throw new Error("deployEndpoint is required")
    if (typeof parameters !== "object") throw new Error("parameters must be an object")

    this.retries = config.retries != null ? config.retries : 3
    if (!Number.isInteger(this.retries) || this.retries < 0) {
      throw new RangeError(`retries must be a non-negative integer, got ${this.retries}`)
    }

    this.timeoutMs = config.timeoutMs != null ? config.timeoutMs : 10_000
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError(`timeoutMs must be a positive integer, got ${this.timeoutMs}`)
    }
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

  /**
   * Deploy the contract, with retries on transient failures.
   */
  public async deploy(): Promise<LaunchResult> {
    const { deployEndpoint, apiKey, contractName, parameters } = this.config
    let attempt = 0
    let lastError: string | undefined

    const body = JSON.stringify({ contractName, parameters })
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    }

    while (attempt <= this.retries) {
      attempt++
      try {
        const res = await this.fetchWithTimeout(
          deployEndpoint,
          { method: "POST", headers, body },
          this.timeoutMs
        )

        if (!res.ok) {
          const text = await res.text()
          lastError = `HTTP ${res.status}: ${text}`
          // retry on 5xx errors
          if (res.status >= 500 && attempt <= this.retries) {
            continue
          }
          return { success: false, error: lastError, attempts: attempt }
        }

        const json = await res.json()
        return {
          success: true,
          address: json.contractAddress,
          transactionHash: json.txHash,
          attempts: attempt,
        }
      } catch (err: any) {
        lastError = err.name === "AbortError"
          ? `Request timed out after ${this.timeoutMs}ms`
          : err.message
        if (attempt > this.retries) {
          break
        }
        // exponential backoff before retry
        const backoff = 2 ** attempt * 100
        await new Promise(r => setTimeout(r, backoff))
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: attempt,
    }
  }
}
