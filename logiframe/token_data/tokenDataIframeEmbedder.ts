import type { TokenDataPoint } from "./tokenDataFetcher"

export interface DataIframeConfig {
  containerId: string
  iframeUrl: string
  token: string
  refreshMs?: number
  width?: string  // e.g. "100%" or "600px"
  height?: string // e.g. "100%" or "400px"
  targetOrigin?: string // for postMessage security
}

export class TokenDataIframeEmbedder {
  private iframe?: HTMLIFrameElement
  private refreshHandle?: number

  constructor(private cfg: DataIframeConfig) {}

  /**
   * Initialize the iframe embedder:
   * - Creates and appends the iframe
   * - Listens for load event to post data
   * - Sets up periodic refresh if configured
   */
  public async init(): Promise<void> {
    const container = document.getElementById(this.cfg.containerId)
    if (!container) {
      throw new Error(`Container not found: ${this.cfg.containerId}`)
    }

    // Prevent double init
    if (this.iframe) return

    this.iframe = document.createElement("iframe")
    this.iframe.src = this.cfg.iframeUrl
    this.iframe.style.border = "none"
    this.iframe.width = this.cfg.width ?? "100%"
    this.iframe.height = this.cfg.height ?? "100%"

    // On load, immediately post data
    this.iframe.onload = () => void this.postTokenData()

    container.appendChild(this.iframe)

    // Set up refresh interval if requested
    if (this.cfg.refreshMs && this.cfg.refreshMs > 0) {
      this.refreshHandle = window.setInterval(
        () => void this.postTokenData(),
        this.cfg.refreshMs
      )
    }
  }

  /**
   * Fetches latest token history and posts it into the iframe.
   * Handles errors gracefully.
   */
  private async postTokenData(): Promise<void> {
    if (!this.iframe?.contentWindow) return

    try {
      const { TokenDataFetcher } = await import("./tokenDataFetcher")
      const fetcher = new TokenDataFetcher(this.cfg.iframeUrl)
      const data: TokenDataPoint[] = await fetcher.fetchHistory(this.cfg.token)

      const message = {
        type: "ELARIS_TOKEN_DATA",
        token: this.cfg.token,
        data,
      }

      const targetOrigin = this.cfg.targetOrigin ?? "*"
      this.iframe.contentWindow.postMessage(message, targetOrigin)
    } catch (err) {
      console.error("[TokenDataIframeEmbedder] postTokenData error:", err)
    }
  }

  /**
   * Clean up the iframe and any timers
   */
  public dispose(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle)
      this.refreshHandle = undefined
    }
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe)
      this.iframe = undefined
    }
  }
}
