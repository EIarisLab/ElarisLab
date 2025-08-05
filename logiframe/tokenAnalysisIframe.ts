import type { TokenMetrics } from "./tokenAnalysisCalculator"

export interface IframeConfig {
  containerId: string
  srcUrl: string
  metrics: TokenMetrics
  /** Interval at which metrics are reposted (ms) */
  refreshIntervalMs?: number
  /** Target origin for postMessage (default: iframe src origin) */
  targetOrigin?: string
}

export class TokenAnalysisIframe {
  private iframeEl: HTMLIFrameElement | null = null
  private refreshTimerId: number | null = null
  private targetOrigin: string

  constructor(private config: IframeConfig) {
    // Derive default targetOrigin from srcUrl if not provided
    const url = new URL(this.config.srcUrl, window.location.href)
    this.targetOrigin = this.config.targetOrigin ?? url.origin
  }

  /** Initialize and insert the iframe into the DOM */
  public init(): void {
    const container = document.getElementById(this.config.containerId)
    if (!container) {
      throw new Error(`Container not found: ${this.config.containerId}`)
    }

    // Prevent double-init
    if (this.iframeEl) {
      console.warn("Iframe already initialized")
      return
    }

    const iframe = document.createElement("iframe")
    iframe.src = this.config.srcUrl
    iframe.width = "100%"
    iframe.height = "100%"
    iframe.setAttribute("frameBorder", "0")
    iframe.onload = () => this.postMetrics()
    container.appendChild(iframe)
    this.iframeEl = iframe

    if (this.config.refreshIntervalMs && this.config.refreshIntervalMs > 0) {
      this.refreshTimerId = window.setInterval(
        () => this.postMetrics(),
        this.config.refreshIntervalMs
      )
    }
  }

  /** Send current metrics to the iframe via postMessage */
  private postMetrics(): void {
    if (!this.iframeEl?.contentWindow) {
      console.warn("Iframe not ready for messaging")
      return
    }
    const message = {
      type: "TOKEN_ANALYSIS_METRICS" as const,
      payload: this.config.metrics,
      timestamp: Date.now(),
    }
    this.iframeEl.contentWindow.postMessage(message, this.targetOrigin)
    console.debug("Posted metrics to iframe:", message)
  }

  /**
   * Update metrics at runtime.
   * Next postMetrics() will use the new values.
   */
  public updateMetrics(metrics: TokenMetrics): void {
    this.config.metrics = metrics
    this.postMetrics()
  }

  /** Remove iframe and cleanup timers/listeners */
  public destroy(): void {
    if (this.refreshTimerId !== null) {
      window.clearInterval(this.refreshTimerId)
      this.refreshTimerId = null
    }
    if (this.iframeEl) {
      this.iframeEl.remove()
      this.iframeEl = null
    }
  }
}
