export interface Signal {
  id: string
  type: string
  timestamp: number
  payload: Record<string, unknown>
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export class SignalApiClient {
  private defaultTimeoutMs = 5000

  constructor(
    private baseUrl: string,
    private apiKey?: string,
    private timeoutMs: number = 5000
  ) {}

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    }
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`
    }
    return headers
  }

  private async request<T>(path: string, method: string = "GET"): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(url, {
        method,
        headers: this.getHeaders(),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status} (${res.statusText})` }
      }

      const data = (await res.json()) as T
      return { success: true, data }
    } catch (err: any) {
      const msg = err.name === "AbortError"
        ? `Request timed out after ${this.timeoutMs}ms`
        : err.message
      return { success: false, error: msg }
    }
  }

  /** Fetches all signals from /signals */
  public fetchAllSignals(): Promise<ApiResponse<Signal[]>> {
    return this.request<Signal[]>("/signals")
  }

  /** Fetches a single signal by ID */
  public fetchSignalById(id: string): Promise<ApiResponse<Signal>> {
    const encoded = encodeURIComponent(id)
    return this.request<Signal>(`/signals/${encoded}`)
  }
}
