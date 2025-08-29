import type { Signal } from "./SignalApiClient"

export type Millis = number
export type Unary<T> = (v: T) => boolean
export type Mapper<T, R> = (v: T) => R

export interface FilterOptions {
  /** Single type or list of types to include */
  types?: string | string[]
  /** Only include signals with timestamp > since (ms epoch) */
  since?: Millis
  /** Only include signals with timestamp <= until (ms epoch) */
  until?: Millis
  /** Optional custom predicate run after built-in filters */
  where?: Unary<Signal>
}

export interface AggregateEntry {
  count: number
  latestTimestamp: number
}

export interface RateEntry {
  /** events per second over the window */
  eps: number
  /** number of events in the window */
  count: number
  /** window length in seconds */
  windowSec: number
}

/**
 * SignalProcessor converts raw signals into actionable, deterministic views.
 * All methods are pure (no internal state).
 */
export class SignalProcessor {
  /**
   * Filter signals with composable options.
   * Order of checks: type(s) -> since/until -> custom predicate.
   */
  filter(signals: ReadonlyArray<Signal>, opts: FilterOptions = {}): Signal[] {
    if (!Array.isArray(signals) || signals.length === 0) return []
    const typesSet =
      typeof opts.types === "string"
        ? new Set([opts.types])
        : Array.isArray(opts.types)
        ? new Set(opts.types)
        : undefined

    const since = typeof opts.since === "number" ? opts.since : undefined
    const until = typeof opts.until === "number" ? opts.until : undefined
    const where = typeof opts.where === "function" ? opts.where : undefined

    return signals.filter(s => {
      if (!s) return false
      if (typesSet && !typesSet.has(s.type)) return false
      if (since !== undefined && !(s.timestamp > since)) return false
      if (until !== undefined && !(s.timestamp <= until)) return false
      return where ? !!where(s) : true
    })
  }

  /**
   * Deduplicate signals by a composite key function (default: type@timestamp@JSON(payload)).
   * Keeps the first occurrence.
   */
  dedupe(signals: ReadonlyArray<Signal>, keyFn?: Mapper<Signal, string>): Signal[] {
    if (!Array.isArray(signals) || signals.length === 0) return []
    const key = keyFn ?? ((s: Signal) => `${s.type}@${s.timestamp}@${this.stableJson(s.payload)}`)
    const seen = new Set<string>()
    const out: Signal[] = []
    for (const s of signals) {
      const k = key(s)
      if (!seen.has(k)) {
        seen.add(k)
        out.push(s)
      }
    }
    return out
  }

  /**
   * Stable aggregate by type with counts and latest timestamp.
   */
  aggregateByType(signals: ReadonlyArray<Signal>): Record<string, AggregateEntry> {
    const acc: Record<string, AggregateEntry> = Object.create(null)
    for (const s of signals) {
      const e = acc[s.type] ?? { count: 0, latestTimestamp: 0 }
      e.count += 1
      if (s.timestamp > e.latestTimestamp) e.latestTimestamp = s.timestamp
      acc[s.type] = e
    }
    return acc
  }

  /**
   * Compute event rates per type over a fixed time window [now - windowMs, now].
   */
  ratesByType(signals: ReadonlyArray<Signal>, nowMs: number, windowMs: Millis): Record<string, RateEntry> {
    if (windowMs <= 0) return {}
    const from = nowMs - windowMs
    const window = this.filter(signals, {
