
import type { TokenDataPoint } from "./tokenDataFetcher"

export interface DataIframeConfig {
  containerId: string
  iframeUrl: string
  token: string
  refreshMs?: number
}

export class TokenDataIframeEmbedder {
  private iframe?: HTMLIFrameElement

  constructor(private cfg: DataIframeConfig) {}

  async init() {
    const container = document.getElementById(this.cfg.containerId)
    if (!container) throw new Error(`Container not found: ${this.cfg.containerId}`)

    this.iframe = document.createElement("iframe")
    this.iframe.src = this.cfg.iframeUrl
    this.iframe.style.border = "none"
    this.iframe.width = "100%"
    this.iframe.height = "100%"
    this.iframe.onload = () => this.postTokenData()
    container.appendChild(this.iframe)

    if (this.cfg.refreshMs) {
      setInterval(() => this.postTokenData(), this.cfg.refreshMs)
    }
  }

  private async postTokenData() {
    if (!this.iframe?.contentWindow) return
    // fetch latest data
    const fetcher = new (await import("./tokenDataFetcher")).TokenDataFetcher(this.cfg.iframeUrl)
    const data: TokenDataPoint[] = await fetcher.fetchHistory(this.cfg.token)
    this.iframe.contentWindow.postMessage(
      { type: "ELARIS_TOKEN_DATA", token: this.cfg.token, data },
      "*"
    )
  }
}