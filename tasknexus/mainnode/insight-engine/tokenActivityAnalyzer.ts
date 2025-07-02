/**
 * Analyze on‐chain token activity: fetches recent activity and summarizes transfers.
 */
export interface ActivityRecord {
  timestamp: number
  signature: string
  source: string
  destination: string
  amount: number
}

export class TokenActivityAnalyzer {
  constructor(private rpcEndpoint: string) {}

  async fetchRecentSignatures(mint: string, limit = 100): Promise<string[]> {
    const url = `${this.rpcEndpoint}/getSignaturesForAddress/${mint}?limit=${limit}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch signatures: ${res.status}`)
    const json = await res.json()
    return json.map((e: any) => e.signature)
  }

  async analyzeActivity(
    mint: string,
    limit = 50
  ): Promise<ActivityRecord[]> {
    const sigs = await this.fetchRecentSignatures(mint, limit)
    const out: ActivityRecord[] = []
    for (const sig of sigs) {
      const txRes = await fetch(`${this.rpcEndpoint}/getTransaction/${sig}`)
      if (!txRes.ok) continue
      const tx = await txRes.json()
      const pre = tx.meta.preTokenBalances || []
      const post = tx.meta.postTokenBalances || []
      for (let i = 0; i < post.length; i++) {
        const p = post[i]
        const q = pre[i] || { uiTokenAmount: { uiAmount: 0 }, owner: null }
        const delta = (p.uiTokenAmount.uiAmount || 0) - (q.uiTokenAmount.uiAmount || 0)
        if (delta !== 0) {
          out.push({
            timestamp: tx.blockTime * 1000,
            signature: sig,
            source: q.owner || "unknown",
            destination: p.owner || "unknown",
            amount: Math.abs(delta),
          })
        }
      }
    }
    return out
  }
}
