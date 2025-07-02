import nodemailer from "nodemailer"

export interface AlertConfig {
  email?: {
    host: string
    port: number
    user: string
    pass: string
    from: string
    to: string[]
  }
  console?: boolean
}

export interface AlertSignal {
  title: string
  message: string
  level: "info" | "warning" | "critical"
}

export class ElarisAlertService {
  constructor(private cfg: AlertConfig) {}

  private async sendEmail(signal: AlertSignal) {
    if (!this.cfg.email) return
    const { host, port, user, pass, from, to } = this.cfg.email
    const transporter = nodemailer.createTransport({ host, port, auth: { user, pass } })
    await transporter.sendMail({
      from,
      to,
      subject: `[${signal.level.toUpperCase()}] ${signal.title}`,
      text: signal.message,
    })
  }

  private logConsole(signal: AlertSignal) {
    if (!this.cfg.console) return
    console.log(
      `[ElarisAlert][${signal.level.toUpperCase()}] ${signal.title}\n${signal.message}`
    )
  }

  async dispatch(signals: AlertSignal[]) {
    for (const sig of signals) {
      await this.sendEmail(sig)
      this.logConsole(sig)
    }
  }
}
