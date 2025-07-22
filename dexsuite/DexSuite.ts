import fetch from 'node-fetch'

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
}

export class DexSuite {
  // in-memory cache with TTL
  private cache = new Map<string, { timestamp: number; data: PairInfo[] }>()

  constructor(private config: DexSuiteConfig) {}

  private async fetchFromApi<T>(
    api: { name: string; baseUrl: string; apiKey?: string },
    path: string
  ): Promise<T> {
    const { timeoutMs = 10000, retries = 1 } = this.config
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(`${api.baseUrl}${path}`, {
          headers: api.apiKey ? { Authorization: `Bearer ${api.apiKey}` } : {},
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`${api.name} ${path} ${res.status}`)
        return (await res.json()) as T
      } catch (err) {
        if (attempt === retries) throw err
      } finally {
        clearTimeout(timer)
      }
    }
    throw new Error('Unreachable fetch logic')
  }

  /**
   * Retrieve aggregated pair info across all configured DEX APIs,
   * with optional caching.
   */
  async getPairInfo(pairAddress: string): Promise<PairInfo[]> {
    const now = Date.now()
    const ttl = this.config.cacheTTLMs ?? 60000
    const cached = this.cache.get(pairAddress)
    if (cached && now - cached.timestamp < ttl) return cached.data

    const results: PairInfo[] = []
    await Promise.all(
      this.config.apis.map(async api => {
        try {
          const data = await this.fetchFromApi<any>(api, `/pair/${pairAddress}`)
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
          // skip failed API
        }
      })
    )

    this.cache.set(pairAddress, { timestamp: now, data: results })
    return results
  }

  /**
   * Compare a list of pairs across exchanges, returning the best volume and liquidity.
   */
  comparePairs(
    pairs: string[]
  ): Promise<Record<string, { bestVolume: PairInfo; bestLiquidity: PairInfo }>> {
    return Promise.all(
      pairs.map(async addr => {
        const infos = await this.getPairInfo(addr)
        const bestVolume = infos.reduce((a, b) =>
          b.volume24hUsd > a.volume24hUsd ? b : a
        , infos[0])
        const bestLiquidity = infos.reduce((a, b) =>
          b.liquidityUsd > a.liquidityUsd ? b : a
        , infos[0])
        return [addr, { bestVolume, bestLiquidity }] as const
      })
    ).then(Object.fromEntries)
  }
}
