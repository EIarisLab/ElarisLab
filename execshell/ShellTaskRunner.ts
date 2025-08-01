// ShellTaskRunner.ts

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
  executedAt: number
  durationMs: number
}

/**
 * Runner for scheduling and executing shell tasks.
 */
export class ShellTaskRunner {
  private tasks: ShellTask[] = []
  private defaultConcurrency: number

  constructor(concurrency: number = 1) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError(`Concurrency must be a positive integer, got ${concurrency}`)
    }
    this.defaultConcurrency = concurrency
  }

  /**
   * Schedule a shell task for execution.
   */
  public scheduleTask(task: ShellTask): void {
    if (!task.id || !task.command) {
      throw new Error("Task must have both id and command")
    }
    this.tasks.push(task)
  }

  /**
   * Get list of currently scheduled tasks.
   */
  public getScheduledTasks(): ShellTask[] {
    return [...this.tasks]
  }

  /**
   * Clear all scheduled tasks without executing.
   */
  public clearTasks(): void {
    this.tasks = []
  }

  /**
   * Execute all scheduled tasks, optionally in parallel.
   *
   * @param concurrency Number of parallel tasks (defaults to constructor setting)
   */
  public async runAll(concurrency?: number): Promise<ShellResult[]> {
    const limit = pLimit(concurrency ?? this.defaultConcurrency)
    const tasksToRun = [...this.tasks]
    this.tasks = [] // clear upfront to prevent re-run
    const results: ShellResult[] = []

    const promises = tasksToRun.map(task =>
      limit(async () => {
        const start = Date.now()
        try {
          const output = await execCommand(task.command)
          const durationMs = Date.now() - start
          results.push({
            taskId: task.id,
            output,
            executedAt: start,
            durationMs,
          })
        } catch (err: any) {
          const durationMs = Date.now() - start
          results.push({
            taskId: task.id,
            error: err.message,
            executedAt: start,
            durationMs,
          })
        }
      })
    )

    await Promise.all(promises)
    return results
  }
}
