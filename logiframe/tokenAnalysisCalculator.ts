export interface PricePoint {
  timestamp: number
  price: number
}

export interface TokenMetrics {
  averagePrice: number
  volatility: number
  maxPrice: number
  minPrice: number
}

export interface ExtendedTokenMetrics extends TokenMetrics {
  medianPrice: number
  percentile25: number
  percentile75: number
  priceRange: number
  averageChangeRate: number
}

export type VolatilityMode = "price" | "log"

export interface TokenAnalysisOptions {
  /** Use sample standard deviation (n-1) when possible; defaults to true */
  useSampleStd?: boolean
  /** Volatility computed on raw prices or log returns; defaults to "log" */
  volatilityMode?: VolatilityMode
  /** Winsorize tails by percentile (e.g., 0.5 => clamp to [0.5%, 99.5%]); disabled if undefined */
  clampOutliersPct?: number
}

export class TokenAnalysisCalculator {
  private byTime: PricePoint[]
  private priceAsc: number[]
  private opts: Required<TokenAnalysisOptions>

  constructor(
    private data: PricePoint[],
    options: TokenAnalysisOptions = {}
  ) {
    // Defensive copy and sanitation
    const sane = (data ?? []).filter(
      (p) => p && Number.isFinite(p.timestamp) && Number.isFinite(p.price)
    )
    this.byTime = sane.slice().sort((a, b) => a.timestamp - b.timestamp)
    this.priceAsc = sane.map((p) => p.price).sort((a, b) => a - b)

    this.opts = {
      useSampleStd: options.useSampleStd ?? true,
      volatilityMode: options.volatilityMode ?? "log",
      clampOutliersPct: options.clampOutliersPct as number | undefined,
    } as Required<TokenAnalysisOptions>

    if (typeof this.opts.clampOutliersPct === "number") {
      this.applyWinsorization(this.opts.clampOutliersPct)
    }
  }

  private applyWinsorization(pct: number): void {
    if (!(pct > 0 && pct < 50)) return
    const lo = this.getPercentile(pct)
    const hi = this.getPercentile(100 - pct)
    // Recompute arrays with clamped values
    const clamped = this.byTime.map((p) => ({
      timestamp: p.timestamp,
      price: Math.min(hi, Math.max(lo, p.price)),
    }))
    this.byTime = clamped
    this.priceAsc = clamped.map((p) => p.price).sort((a, b) => a - b)
  }

  private prices(): number[] {
    return this.priceAsc
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0
    let sum = 0
    for (let i = 0; i < arr.length; i++) sum += arr[i]
    return sum / arr.length
  }

  getAveragePrice(): number {
    return this.mean(this.prices())
  }

  /**
   * Volatility computed either on:
   * - "log": standard deviation of log returns ln(Pt / Pt-1)
   * - "price": standard deviation of price series
   * Uses sample or population variance per opts.useSampleStd
   */
  getVolatility(): number {
    if (this.opts.volatilityMode === "price") {
      const arr = this.prices()
      const n = arr.length
      if (n <= 1) return 0
      const mean = this.mean(arr)
      let ssd = 0
      for (let i = 0; i < n; i++) {
        const d = arr[i] - mean
        ssd += d * d
      }
      const denom = this.opts.useSampleStd && n > 1 ? n - 1 : n
      return Math.sqrt(ssd / denom)
    }

    // "log" mode
    const rets: number[] = []
    for (let i = 1; i < this.byTime.length; i++) {
      const p0 = this.byTime[i - 1].price
      const p1 = this.byTime[i].price
      if (p0 > 0 && p1 > 0) {
        rets.push(Math.log(p1 / p0))
      }
    }
    const n = rets.length
    if (n === 0) return 0
    const mean = this.mean(rets)
    let ssd = 0
    for (let i = 0; i < n; i++) {
      const d = rets[i] - mean
      ssd += d * d
    }
    const denom = this.opts.useSampleStd && n > 1 ? n - 1 : n
    return Math.sqrt(ssd / denom)
  }

  getMaxPrice(): number {
    const arr = this.prices()
    return arr.length ? arr[arr.length - 1] : 0
  }

  getMinPrice(): number {
    const arr = this.prices()
    return arr.length ? arr[0] : 0
  }

  getMedianPrice(): number {
    const arr = this.prices()
    const n = arr.length
    if (n === 0) return 0
    const mid = Math.floor(n / 2)
    return n % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid]
  }

  /**
   * Percentile using linear interpolation between closest ranks
   * pct in [0, 100]
   */
  getPercentile(pct: number): number {
    const arr = this.prices()
    const n = arr.length
    if (n === 0) return 0
    if (pct <= 0) return arr[0]
    if (pct >= 100) return arr[n - 1]
    const idx = (pct / 100) * (n - 1)
    const lower = Math.floor(idx)
    const upper = Math.ceil(idx)
    if (lower === upper) return arr[lower]
    const weight = idx - lower
    return arr[lower] * (1 - weight) + arr[upper] * weight
  }

  getPriceRange(): number {
    const max = this.getMaxPrice()
    const min = this.getMinPrice()
    return max - min
  }

  /**
   * Average arithmetic return over time-ordered series
   * Skips steps where previous price is 0
   */
  getAverageChangeRate(): number {
    let sum = 0
    let m = 0
    for (let i = 1; i < this.byTime.length; i++) {
      const prev = this.byTime[i - 1].price
      const curr = this.byTime[i].price
      if (prev > 0) {
        sum += (curr - prev) / prev
        m++
      }
    }
    return m > 0 ? sum / m : 0
  }

  computeMetrics(): ExtendedTokenMetrics {
    const averagePrice = this.getAveragePrice()
    const volatility = this.getVolatility()
    const maxPrice = this.getMaxPrice()
    const minPrice = this.getMinPrice()
    const medianPrice = this.getMedianPrice()
    const percentile25 = this.getPercentile(25)
    const percentile75 = this.getPercentile(75)
    const priceRange = this.getPriceRange()
    const averageChangeRate = this.getAverageChangeRate()

    return {
      averagePrice,
      volatility,
      maxPrice,
      minPrice,
      medianPrice,
      percentile25,
      percentile75,
      priceRange,
      averageChangeRate,
    }
  }
}
