import fetch, { RequestInit } from 'node-fetch'

export interface PairInfo {
  exchange: string
  pairAddress: string
  baseSymbol: string
  quoteSymbol: string
  liquidityUsd: number
  volume24hUsd: number
  priceUsd: number
}

export interface DexSuiteConfig {
  apis: Array<{ name: string; baseUrl: string; apiKey?: string }>
  timeoutMs?: number
  retries?: number
  cacheTTLMs?: number
  backoffFactorMs?: number
}

interface CacheEntry<T> {
  timestamp: number
  data: T
}

export class DexSuite {
  private cache = new Map<string, CacheEntry<PairInfo[]>>()
  private timeoutMs: number
  private retries: number
  private cacheTTLMs: number
  private backoffFactorMs: number

  constructor(private config: DexSuiteConfig) {
    this.timeoutMs = config.timeoutMs ?? 10_000
    this.retries = config.retries ?? 2
    this.cacheTTLMs = config.cacheTTLMs ?? 60_000
    this.backoffFactorMs = config.backoffFactorMs ?? 200
  }

  /** Clear entire in-memory cache */
  public clearCache(): void {
    this.cache.clear()
  }

  /** Remove a single pair from cache */
  public invalidate(pairAddress: string): void {
    this.cache.delete(pairAddress)
  }

  private async fetchFromApi<T>(
    api: { name: string; baseUrl: string; apiKey?: string },
    path: string
  ): Promise<T> {
    const url = `${api.baseUrl}${path}`
    const headers: Record<string, string> = api.apiKey
      ? { Authorization: `Bearer ${api.apiKey}` }
      : {}

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        } as RequestInit)
        clearTimeout(timer)

        if (!res.ok) {
          throw new Error(
            `API ${api.name} ${path} returned ${res.status} ${res.statusText}`
          )
        }
        return (await res.json()) as T
      } catch (err) {
        clearTimeout(timer)
        if (attempt < this.retries) {
          const delay = this.backoffFactorMs * 2 ** attempt
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        console.error(
          `[DexSuite] Failed ${api.name}${path} after ${attempt + 1} attempts:`,
          err
        )
        throw err
      }
    }
    // unreachable
    throw new Error('[DexSuite] fetchFromApi: logic error')
  }

  /**
   * Retrieve aggregated pair info across all configured DEX APIs,
   * with optional in-memory caching.
   */
  public async getPairInfo(pairAddress: string): Promise<PairInfo[]> {
    const now = Date.now()
    const cached = this.cache.get(pairAddress)
    if (cached && now - cached.timestamp < this.cacheTTLMs) {
      return cached.data
    }

    const results: PairInfo[] = []
    await Promise.all(
      this.config.apis.map(async api => {
        try {
          const data = await this.fetchFromApi<{
            token0: { symbol: string }
            token1: { symbol: string }
            liquidityUsd: number | string
            volume24hUsd: number | string
            priceUsd: number | string
          }>(api, `/pair/${encodeURIComponent(pairAddress)}`)

          results.push({
            exchange: api.name,
            pairAddress,
            baseSymbol: data.token0.symbol,
            quoteSymbol: data.token1.symbol,
            liquidityUsd: Number(data.liquidityUsd),
            volume24hUsd: Number(data.volume24hUsd),
            priceUsd: Number(data.priceUsd),
          })
        } catch {
          // skip this API on failure
        }
      })
    )

    this.cache.set(pairAddress, { timestamp: now, data: results })
    return results
  }

  /**
   * Compare a list of pair addresses across exchanges,
   * returning the highest-volume and highest-liquidity sources.
   */
  public async comparePairs(
    pairs: string[]
  ): Promise<
    Record<string, { bestVolume: PairInfo; bestLiquidity: PairInfo }>
  > {
    const entries = await Promise.all(
      pairs.map(async addr => {
        const infos = await this.getPairInfo(addr)
        if (infos.length === 0) {
          throw new Error(`No data for pair ${addr}`)
        }
        const bestVolume = infos.reduce((a, b) =>
          b.volume24hUsd > a.volume24hUsd ? b : a
        )
        const bestLiquidity = infos.reduce((a, b) =>
          b.liquidityUsd > a.liquidityUsd ? b : a
        )
        return [addr, { bestVolume, bestLiquidity }] as const
      })
    )

    return Object.fromEntries(entries)
  }
}
