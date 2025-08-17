import { execCommand } from './execCommand'
import pLimit from 'p-limit'

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
 * Schedules and executes shell tasks with optional concurrency.
 */
export class ShellTaskRunner {
  private readonly defaultConcurrency: number
  private scheduledTasks: ShellTask[] = []

  constructor(concurrency: number = 1) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError(`Concurrency must be a positive integer. Received: ${concurrency}`)
    }
    this.defaultConcurrency = concurrency
  }

  /**
   * Adds a task to the queue.
   */
  public scheduleTask(task: ShellTask): void {
    if (!task.id?.trim() || !task.command?.trim()) {
      throw new Error('Each task must have a valid `id` and `command`.')
    }
    this.scheduledTasks.push(task)
  }

  /**
   * Returns a copy of the currently scheduled tasks.
   */
  public getScheduledTasks(): ReadonlyArray<ShellTask> {
    return [...this.scheduledTasks]
  }

  /**
   * Clears the task queue.
   */
  public clearTasks(): void {
    this.scheduledTasks = []
  }

  /**
   * Executes all scheduled tasks in parallel with concurrency control.
   * Returns an array of ShellResult with either `output` or `error`.
   */
  public async runAll(concurrency?: number): Promise<ShellResult[]> {
    const tasksToRun = [...this.scheduledTasks]
    this.scheduledTasks = [] // prevent re-execution

    const limit = pLimit(concurrency ?? this.defaultConcurrency)
    const results: ShellResult[] = []

    const runTask = async (task: ShellTask): Promise<void> => {
      const startedAt = Date.now()
      try {
        const output = await execCommand(task.command)
        results.push({
          taskId: task.id,
          output,
          executedAt: startedAt,
          durationMs: Date.now() - startedAt,
        })
      } catch (error: unknown) {
        results.push({
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
          executedAt: startedAt,
          durationMs: Date.now() - startedAt,
        })
      }
    }

    await Promise.all(tasksToRun.map(task => limit(() => runTask(task))))
    return results
  }
}
