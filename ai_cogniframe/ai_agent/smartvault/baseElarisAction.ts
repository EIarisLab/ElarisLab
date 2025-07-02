import { z } from "zod"

/**
 * Base types for any ElarisFlow action.
 */
export type ElarisActionSchema = z.ZodObject<z.ZodRawShape>

export interface ElarisActionResponse<T> {
  notice: string
  data?: T
}

export interface BaseElarisAction<
  S extends ElarisActionSchema,
  R,
  Ctx = unknown
> {
  id: string
  summary: string
  input: S
  execute(args: { payload: z.infer<S>; context: Ctx }): Promise<ElarisActionResponse<R>>
}
