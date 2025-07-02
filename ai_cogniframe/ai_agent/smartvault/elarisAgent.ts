import type { BaseElarisAction, ElarisActionResponse } from "./baseElarisAction"
import { z } from "zod"

interface AgentContext {
  apiEndpoint: string
  apiKey: string
}

/**
 * Central Elaris Agent: routes calls to registered actions.
 */
export class ElarisAgent {
  private actions = new Map<string, BaseElarisAction<any, any, AgentContext>>()

  register<S, R>(action: BaseElarisAction<S, R, AgentContext>): void {
    this.actions.set(action.id, action)
  }

  async invoke<R>(
    actionId: string,
    payload: unknown,
    ctx: AgentContext
  ): Promise<ElarisActionResponse<R>> {
    const action = this.actions.get(actionId)
    if (!action) throw new Error(`Unknown action "${actionId}"`)
    // @ts-ignore
    return action.execute({ payload, context: ctx }) as Promise<ElarisActionResponse<R>>
  }
}
