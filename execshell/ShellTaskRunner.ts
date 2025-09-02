import { execCommand } from "./execCommand"
import pLimit from "p-limit"

export interface ShellTask {
  id: string
  command: string
  description?: string
}

export interface ShellResult {
  taskId: string
  output?: string
  error?: string
  exitCode?: number
  executedAt: number
  durationMs: number
  attempts: number
}

export interface RunOptions {
  concurrency?: number
  retries?: number
  backoffMs?: number
  timeoutMs?: number
}

type InternalTask = ShellTask & {
  retries: number
  backoffMs: number
  timeoutMs: number
}

export class ShellTaskRunner {
  private readonly defaultConcurrency: number
  private readonly defaultRetries: number
  private readonly defaultBackoffMs: number
  private readonly defaultTimeoutMs: number
  private scheduledTasks: InternalTask[] = []
  private taskIds = new Set<string>()

  constructor(concurrency: number = 1, retries = 0, backoffMs = 0, timeoutMs = 0) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError(`concurrency must be a positive integer, received ${concurrency}`)
    }
    if (!Number.isInteger(retries) || retries < 0) {
      throw new RangeError(`retries must be a nonnegative integer, received ${retries}`)
    }
    if (!Number.isInteger(backoffMs) || backoffMs < 0) {
      throw new RangeError(`backoffMs must be a nonnegative integer, received ${backoffMs}`)
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0) {
      throw new RangeError(`timeoutMs must be a nonnegative integer, received ${timeoutMs}`)
    }
    this.defaultConcurrency = concurrency
    this.defaultRetries = retries
    this.defaultBackoffMs = backoffMs
    this.defaultTimeoutMs = timeoutMs
  }

  public scheduleTask(task: ShellTask, overrides?: Partial<RunOptions>): void {
    if (!task.id?.trim() || !task.command?.trim()) {
      throw new Error("each task must have a valid id and command")
    }
    if (this.taskIds.has(task.id)) {
      throw new Error(`duplicate task id: ${task.id}`)
    }
    const retries = Math.max(
      0,
      Math.floor(overrides?.retries ?? this.defaultRetries)
    )
    const backoffMs = Math.max(
      0,
      Math.floor(overrides?.backoffMs ?? this.defaultBackoffMs)
    )
    const timeoutMs = Math.max(
      0,
      Math.floor(overrides?.timeoutMs ?? this.defaultTimeoutMs)
    )
    this.scheduledTasks.push({ ...task, retries, backoffMs, timeoutMs })
    this.taskIds.add(task.id)
  }

  public scheduleMany(tasks: ShellTask[], overrides?: Partial<RunOptions>): void {
    for (const t of tasks) this.scheduleTask(t, overrides)
  }

  public removeTask(taskId: string): boolean {
    const idx = this.scheduledTasks.findIndex(t => t.id === taskId)
    if (idx === -1) return false
    this.scheduledTasks.splice(idx, 1)
    this.taskIds.delete(taskId)
    return true
  }

  public clearTasks(): void {
    this.scheduledTasks = []
    this.taskIds.clear()
  }

  public getScheduledTasks(): ReadonlyArray<ShellTask> {
    return this.scheduledTasks.map(({ id, command, description }) => ({ id, command, description }))
  }

  public async runAll(options?: RunOptions): Promise<ShellResult[]> {
    const tasksToRun = [...this.scheduledTasks]
    this.clearTasks()

    const concurrency = Math.max(
      1,
      Math.floor(options?.concurrency ?? this.defaultConcurrency)
    )
    const limit = pLimit(concurrency)

    const results: ShellResult[] = new Array(tasksToRun.length)
    await Promise.all(
      tasksToRun.map((task, index) =>
        limit(async () => {
          results[index] = await this.runSingle(task)
        })
      )
    )
    return results
  }

  private async runSingle(task: InternalTask): Promise<ShellResult> {
    const startedAt = Date.now()
    let attempts = 0

    while (true) {
      attempts++
      try {
        const output = await this.execWithTimeout(task.command, task.timeoutMs)
        return {
          taskId: task.id,
          output,
          executedAt: startedAt,
          durationMs: Date.now() - startedAt,
          attempts,
          exitCode: 0
        }
      } catch (err: any) {
        if (attempts <= task.retries) {
          const delayMs = task.backoffMs * attempts
          if (delayMs > 0) await this.delay(delayMs)
          continue
        }
        return {
          taskId: task.id,
          error: err?.message ?? String(err),
          executedAt: startedAt,
          durationMs: Date.now() - startedAt,
          attempts
        }
      }
    }
  }

  private async execWithTimeout(command: string, timeoutMs: number): Promise<string> {
    if (!timeoutMs || timeoutMs <= 0) {
      return execCommand(command)
    }
    let timeoutHandle: NodeJS.Timeout | undefined
    try {
      const race = await Promise.race<string>([
        execCommand(command),
        new Promise<string>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`timeout after ${timeoutMs}ms`)),
            timeoutMs
          )
        })
      ])
      return race
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
