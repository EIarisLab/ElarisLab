import { exec } from "child_process"

export interface ExecOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number
  /** Working directory */
  cwd?: string
  /** Environment variables */
  env?: NodeJS.ProcessEnv
  /** Max buffer for stdout/stderr in bytes (default 10MB) */
  maxBuffer?: number
  /** Abort via signal */
  signal?: AbortSignal
  /** Explicit shell (e.g., "/bin/bash", "powershell.exe") */
  shell?: string
}

export class ExecError extends Error {
  code?: number | null
  signal?: NodeJS.Signals | null
  stdout?: string
  stderr?: string

  constructor(message: string, params: { code?: number | null; signal?: NodeJS.Signals | null; stdout?: string; stderr?: string } = {}) {
    super(message)
    this.name = "ExecError"
    this.code = params.code ?? null
    this.signal = params.signal ?? null
    this.stdout = params.stdout ?? ""
    this.stderr = params.stderr ?? ""
  }
}

/**
 * Execute a shell command and return trimmed stdout.
 * Throws ExecError on non-zero exit, timeout, or signal.
 */
export function execCommand(command: string, options: ExecOptions = {}): Promise<string> {
  const {
    timeoutMs = 30_000,
    cwd,
    env,
    maxBuffer = 10 * 1024 * 1024,
    signal,
    shell,
  } = options

  return new Promise((resolve, reject) => {
    const child = exec(command, { timeout: timeoutMs, cwd, env, maxBuffer, signal, shell, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as any).code as number | null
        const sig = (error as any).signal as NodeJS.Signals | null
        return reject(
          new ExecError(
            `Command failed${code !== null && code !== undefined ? ` with exit code ${code}` : ""}${sig ? ` due to signal ${sig}` : ""}`,
            { code, signal: sig, stdout: stdout?.toString(), stderr: stderr?.toString() }
          )
        )
      }
      resolve((stdout || "").trim())
    })

    // Best-effort input safety: ensure streams are drained to avoid backpressure issues
    // Users can still attach listeners to child if they need streaming in the future
    child.stdout?.resume()
    child.stderr?.resume()
  })
}
