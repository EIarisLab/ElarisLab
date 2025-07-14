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

export class TokenAnalysisCalculator {
  constructor(private data: PricePoint[]) {}

  private prices(): number[] {
    return this.data.map(p => p.price).sort((a, b) => a - b)
  }

  getAveragePrice(): number {
    const n = this.data.length
    if (n === 0) return 0
    const sum = this.data.reduce((acc, p) => acc + p.price, 0)
    return sum / n
  }

  getVolatility(): number {
    const avg = this.getAveragePrice()
    const n = this.data.length || 1
    const variance = this.data.reduce((acc, p) => acc + (p.price - avg) ** 2, 0) / n
    return Math.sqrt(variance)
  }

  getMaxPrice(): number {
    return this.data.reduce((max, p) => (p.price > max ? p.price : max), 0)
  }

  getMinPrice(): number {
    return this.data.reduce((min, p) => (p.price < min ? p.price : min), Infinity)
  }

  getMedianPrice(): number {
    const arr = this.prices()
    const n = arr.length
    if (n === 0) return 0
    const mid = Math.floor(n / 2)
    return n % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid]
  }

  getPercentile(pct: number): number {
    const arr = this.prices()
    const n = arr.length
    if (n === 0) return 0
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

  getAverageChangeRate(): number {
    const n = this.data.length
    if (n < 2) return 0
    let sum = 0
    for (let i = 1; i < n; i++) {
      const prev = this.data[i - 1].price
      if (prev !== 0) {
        sum += (this.data[i].price - prev) / prev
      }
    }
    return sum / (n - 1)
  }

  computeMetrics(): ExtendedTokenMetrics {
    const avg = this.getAveragePrice()
    return {
      averagePrice: avg,
      volatility: this.getVolatility(),
      maxPrice: this.getMaxPrice(),
      minPrice: this.getMinPrice(),
      medianPrice: this.getMedianPrice(),
      percentile25: this.getPercentile(25),
      percentile75: this.getPercentile(75),
      priceRange: this.getPriceRange(),
      averageChangeRate: this.getAverageChangeRate(),
    }
  }
}
