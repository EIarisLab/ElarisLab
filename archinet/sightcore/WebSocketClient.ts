
export interface SightCoreConfig {
  url: string
  protocols?: string[]
  reconnectIntervalMs?: number
}

export type SightCoreMessage = {
  topic: string
  payload: any
  timestamp: number
}

export class SightCoreWebSocket {
  private socket?: WebSocket
  private url: string
  private protocols?: string[]
  private reconnectInterval: number

  constructor(config: SightCoreConfig) {
    this.url = config.url
    this.protocols = config.protocols
    this.reconnectInterval = config.reconnectIntervalMs ?? 5000
  }

  connect(onMessage: (msg: SightCoreMessage) => void, onOpen?: () => void, onClose?: () => void): void {
    this.socket = this.protocols
      ? new WebSocket(this.url, this.protocols)
      : new WebSocket(this.url)

    this.socket.onopen = () => {
      onOpen?.()
    }
    this.socket.onmessage = event => {
      try {
        const msg = JSON.parse(event.data) as SightCoreMessage
        onMessage(msg)
      } catch {
        // ignore invalid messages
      }
    }
    this.socket.onclose = () => {
      onClose?.()
      setTimeout(() => this.connect(onMessage, onOpen, onClose), this.reconnectInterval)
    }
    this.socket.onerror = () => {
      this.socket?.close()
    }
  }

  send(topic: string, payload: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ topic, payload, timestamp: Date.now() })
      this.socket.send(msg)
    }
  }

  disconnect(): void {
    this.socket?.close()
  }
}