import fetch, { RequestInit, HeadersInit } from "node-fetch"

export interface PairInfo {
  exchange: string
  pairAddress: string
  baseSymbol: string
  quoteSymbol: string
  liquidityUsd: number
  volume24hUsd: number
  priceUsd: number
}

export interface ApiConfig {
  name: string
  baseUrl: string
  apiKey?: string
  /** Optional static headers to send with every request to this API */
  headers?: Record<string, string>
  /** Optional custom path builder for pair requests */
  pairPath?: (pairAddress: string) => string
}

export interface DexSuiteConfig {
  apis: ApiConfig[]
  timeoutMs?: number
  retries?: number
  cacheTTLMs?: number
  backoffFactorMs?: number
  /** Clamp for maximum backoff between retries */
  maxBackoffMs?: number
}

interface CacheEntry<T> {
  timestamp: number
  data: T
  etag?: string
}

type PairApiShape = {
  token0: { symbol: string }
  token1: { symbol: string }
  liquidityUsd: number | string
  volume24hUsd: number | string
  priceUsd: number | string
}

export class DexSuite {
  private cache = new Map<string, CacheEntry<PairInfo[]>>() // key: pairAddress
  private etagCache = new Map<string, string>() // key: apiName|path
  private timeoutMs: number
  private retries: number
  private cacheTTLMs: number
  private backoffFactorMs: number
  private maxBackoffMs: number

  constructor(private config: DexSuiteConfig) {
    if (!config?.apis || config.apis.length === 0) {
      throw new Error("DexSuite requires at least one API in config.apis")
    }
    this.timeoutMs = config.timeoutMs ?? 10_000
    this.retries = Math.max(0, config.retries ?? 2)
    this.cacheTTLMs = config.cacheTTLMs ?? 60_000
    this.backoffFactorMs = config.backoffFactorMs ?? 200
    this.maxBackoffMs = config.maxBackoffMs ?? 10_000
  }

  /** Clear entire in-memory cache */
  public clearCache(): void {
    this.cache.clear()
    this.etagCache.clear()
  }

  /** Remove a single pair from cache */
  public invalidate(pairAddress: string): void {
    this.cache.delete(pairAddress)
  }

  private urlJoin(base: string, path: string): string {
    if (!base.endsWith("/") && !path.startsWith("/")) return `${base}/${path}`
    if (base.endsWith("/") && path.startsWith("/")) return `${base}${path.slice(1)}`
    return `${base}${path}`
  }

  private safeNumber(n: unknown, label: string): number {
    const num = typeof n === "string" ? Number(n) : (n as number)
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid numeric value for ${label}: ${n}`)
    }
    return num
  }

  private isRateLimit(err: any): boolean {
    const code = (err && (err.code ?? err.status)) as number | undefined
    const msg = (err && String(err.message || err.toString()).toLowerCase()) || ""
    return code === 429 || msg.includes("rate limit") || msg.includes("too many requests")
  }

  private async fetchFromApi<T>(api: ApiConfig, path: string): Promise<{ data: T; etag?: string }> {
    const url = this.urlJoin(api.baseUrl, path)
    const headers: HeadersInit = {
      ...(api.headers ?? {}),
      ...(api.apiKey ? { Authorization: `Bearer ${api.apiKey}` } : {}),
    }

    const etagKey = `${api.name}|${path}`
    const prevEtag = this.etagCache.get(etagKey)
    if (prevEtag) {
      ;(headers as any)["If-None-Match"] = prevEtag
    }

    let lastErr: any = null

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const res = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        } as RequestInit)
        clearTimeout(timer)

        if (res.status === 304) {
          // Not modified, signal caller to reuse cache
          return { data: null as unknown as T, etag: prevEtag }
        }

        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText)
          const err = new Error(`API ${api.name} ${path} returned ${res.status} ${res.statusText}: ${text}`)
          ;(err as any).status = res.status
          throw err
        }

        const etag = res.headers.get("etag") || undefined
        const json = (await res.json()) as T
        if (etag) this.etagCache.set(etagKey, etag)
        return { data: json, etag }
      } catch (err: any) {
        clearTimeout(timer)
        lastErr = err
        if (attempt < this.retries) {
          const backoff =
            Math.min(this.maxBackoffMs, this.backoffFactorMs * Math.max(1, attempt) * Math.max(1, attempt))
          if (!this.isRateLimit(err)) {
            await new Promise(r => setTimeout(r, backoff))
          } else {
            // If rate-limited, double deterministic backoff
            await new Promise(r => setTimeout(r, Math.min(this.maxBackoffMs, backoff * 2)))
          }
          continue
        }
        throw lastErr
      }
    }
    // Unreachable
    throw new Error("[DexSuite] fetchFromApi: logic error")
  }

  private buildPairPath(api: ApiConfig, pairAddress: string): string {
    if (api.pairPath) return api.pairPath(pairAddress)
    return `/pair/${encodeURIComponent(pairAddress)}`
  }

  /**
   * Retrieve aggregated pair info across all configured DEX APIs,
   * with optional in-memory caching (per pair, aggregated result).
   */
  public async getPairInfo(pairAddress: string): Promise<PairInfo[]> {
    const key = pairAddress
    const now = Date.now()
    const cached = this.cache.get(key)
    if (cached && now - cached.timestamp < this.cacheTTLMs) {
      return cached.data
    }

    const results: PairInfo[] = []
    // Run APIs concurrently; tolerate individual failures
    await Promise.all(
      this.config.apis.map(async api => {
        const path = this.buildPairPath(api, pairAddress)
        try {
          const { data } = await this.fetchFromApi<PairApiShape>(api, path)
          if (data === null) {
            // 304 Not Modified on API level: if we have a previous aggregate cache, reuse it
            return
          }
          results.push({
            exchange: api.name,
            pairAddress,
            baseSymbol: data.token0.symbol,
            quoteSymbol: data.token1.symbol,
            liquidityUsd: this.safeNumber(data.liquidityUsd, "liquidityUsd"),
            volume24hUsd: this.safeNumber(data.volume24hUsd, "volume24hUsd"),
            priceUsd: this.safeNumber(data.priceUsd, "priceUsd"),
          })
        } catch {
          // skip this API on failure, but do not fail the whole aggregation
        }
      })
    )

    // If all APIs failed AND we have a recent cache, serve stale (soft TTL)
    if (results.length === 0 && cached && now - cached.timestamp < this.cacheTTLMs * 5) {
      return cached.data
    }

    this.cache.set(key, { timestamp: now, data: results })
    return results
  }

  /**
   * Compare a list of pair addresses across exchanges,
   * returning the highest-volume and highest-liquidity sources.
   */
  public async comparePairs(
    pairs: string[]
  ): Promise<Record<string, { bestVolume: PairInfo; bestLiquidity: PairInfo }>> {
    const entries = await Promise.all(
      pairs.map(async addr => {
        const infos = await this.getPairInfo(addr)
        if (infos.length === 0) {
          throw new Error(`No data for pair ${addr}`)
        }
        const bestVolume = infos.reduce((a, b) => (b.volume24hUsd > a.volume24hUsd ? b : a))
        const bestLiquidity = infos.reduce((a, b) => (b.liquidityUsd > a.liquidityUsd ? b : a))
        return [addr, { bestVolume, bestLiquidity }] as const
      })
    )

    return Object.fromEntries(entries)
  }
}
