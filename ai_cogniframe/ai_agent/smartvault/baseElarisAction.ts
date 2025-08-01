import { z, ZodTypeAny, ZodIssue } from "zod"

/**
 * Base type for any ElarisFlow action schema
 */
export type ElarisActionSchema = ZodTypeAny

/**
 * Standard response wrapper for ElarisFlow actions
 */
export interface ElarisActionResponse<T> {
  notice: string
  data?: T
}

/**
 * Descriptor for a single action
 */
export interface BaseElarisAction<
  S extends ElarisActionSchema,
  R,
  Ctx = unknown
> {
  /** Unique action identifier */
  id: string
  /** Human-readable summary */
  summary: string
  /** Zod schema for the payload */
  input: S
  /**
   * Execute with parsed payload and context.
   * Should throw or return a response object.
   */
  execute(args: {
    payload: z.infer<S>
    context: Ctx
  }): Promise<ElarisActionResponse<R>>
}

/**
 * Helper to validate raw payload against a schema, throwing a unified error.
 */
export function validatePayload<S extends ElarisActionSchema>(
  schema: S,
  raw: unknown
): z.infer<S> {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((i: ZodIssue) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`Payload validation failed: ${issues}`)
  }
  return result.data
}

/**
 * Wraps an action implementation to handle parsing and error handling uniformly.
 */
export function createElarisAction<
  S extends ElarisActionSchema,
  R,
  Ctx = unknown
>(action: BaseElarisAction<S, R, Ctx>) {
  return {
    id: action.id,
    summary: action.summary,
    async run(rawPayload: unknown, context: Ctx): Promise<ElarisActionResponse<R>> {
      try {
        const payload = validatePayload(action.input, rawPayload)
        return await action.execute({ payload, context })
      } catch (err: any) {
        return {
          notice: `Error in action "${action.id}": ${err.message}`,
        }
      }
    },
  }
}
