import nodemailer from "nodemailer"

export interface AlertConfig {
  email?: {
    host: string
    port: number
    user: string
    pass: string
    from: string
    to: string[]
    secure?: boolean
  }
  console?: boolean
}

export interface AlertSignal {
  title: string
  message: string
  level: "info" | "warning" | "critical"
  timestamp?: number
}

export class ElarisAlertService {
  constructor(private cfg: AlertConfig) {}

  private async sendEmail(signal: AlertSignal): Promise<void> {
    if (!this.cfg.email) return
    const { host, port, user, pass, from, to, secure } = this.cfg.email
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: !!secure,
        auth: { user, pass },
      })
      await transporter.sendMail({
        from,
        to,
        subject: `[${signal.level.toUpperCase()}] ${signal.title}`,
        text: `${signal.message}\n\nSent at: ${new Date(
          signal.timestamp ?? Date.now()
        ).toISOString()}`,
      })
    } catch (err) {
      console.error("[ElarisAlert][EMAIL_ERROR]", (err as Error).message)
    }
  }

  private logConsole(signal: AlertSignal): void {
    if (!this.cfg.console) return
    const ts = new Date(signal.timestamp ?? Date.now()).toISOString()
    const line = `[ElarisAlert][${signal.level.toUpperCase()}][${ts}] ${signal.title}\n${signal.message}`
    if (signal.level === "critical") {
      console.error(line)
    } else if (signal.level === "warning") {
      console.warn(line)
    } else {
      console.log(line)
    }
  }

  public async dispatch(signals: AlertSignal[]): Promise<void> {
    for (const sig of signals) {
      // stamp timestamp if not provided
      if (!sig.timestamp) sig.timestamp = Date.now()
      await this.sendEmail(sig)
      this.logConsole(sig)
    }
  }
}
