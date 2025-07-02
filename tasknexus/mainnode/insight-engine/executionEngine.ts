/**
 * Simple task executor: registers and runs tasks by name.
 */
type Handler = (params: any) => Promise<any>

export class ExecutionEngine {
  private handlers: Record<string, Handler> = {}
  private queue: Array<{ id: string; type: string; params: any }> = []

  register(type: string, handler: Handler): void {
    this.handlers[type] = handler
  }

  enqueue(id: string, type: string, params: any): void {
    if (!this.handlers[type]) throw new Error(`No handler for ${type}`)
    this.queue.push({ id, type, params })
  }

  async runAll(): Promise<Array<{ id: string; result?: any; error?: string }>> {
    const results: Array<{ id: string; result?: any; error?: string }> = []
    while (this.queue.length) {
      const task = this.queue.shift()!
      try {
        const data = await this.handlers[task.type](task.params)
        results.push({ id: task.id, result: data })
      } catch (err: any) {
        results.push({ id: task.id, error: err.message })
      }
    }
    return results
  }
}
