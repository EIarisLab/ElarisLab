import type { SightCoreMessage } from "./WebSocketClient"

export interface AggregatedSignal {
  topic: string
  count: number
  lastPayload: any
  lastTimestamp: number
}

export class SignalAggregator {
  private counts: Record<string, AggregatedSignal> = {}

  processMessage(msg: SightCoreMessage): AggregatedSignal {
    const { topic, payload, timestamp } = msg
    const entry = this.counts[topic] || { topic, count: 0, lastPayload: null, lastTimestamp: 0 }
    entry.count += 1
    entry.lastPayload = payload
    entry.lastTimestamp = timestamp
    this.counts[topic] = entry
    return entry
  }

  getAggregated(topic: string): AggregatedSignal | undefined {
    return this.counts[topic]
  }

  getAllAggregated(): AggregatedSignal[] {
    return Object.values(this.counts)
  }

  /** Remove all aggregated data for a specific topic */
  removeTopic(topic: string): boolean {
    if (this.counts[topic]) {
      delete this.counts[topic]
      return true
    }
    return false
  }

  /** Number of topics currently being aggregated */
  get size(): number {
    return Object.keys(this.counts).length
  }

  reset(): void {
    this.counts = {}
  }
}
