
import { execCommand } from "./execCommand"

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
}

export class ShellTaskRunner {
  private tasks: ShellTask[] = []

  /**
   * Schedule a shell task for execution.
   */
  scheduleTask(task: ShellTask): void {
    this.tasks.push(task)
  }

  /**
   * Execute all scheduled tasks in sequence.
   */
  async runAll(): Promise<ShellResult[]> {
    const results: ShellResult[] = []
    for (const task of this.tasks) {
      const start = Date.now()
      try {
        const output = await execCommand(task.command)
        results.push({
          taskId: task.id,
          output,
          executedAt: start,
        })
      } catch (err: any) {
        results.push({
          taskId: task.id,
          error: err.message,
          executedAt: start,
        })
      }
    }
    // clear after running
    this.tasks = []
    return results
  }
}