
import { z } from "zod"

/**
 * Schema for scheduling a new Elaris task via Typeform submission.
 */
export const TaskFormSchema = z.object({
  taskName: z.string().min(3).max(100),
  taskType: z.enum(["anomalyScan", "tokenAnalytics", "whaleMonitor"]),
  parameters: z
    .record(z.string(), z.string())
    .refine(obj => Object.keys(obj).length > 0, "Parameters must include at least one key"),
  scheduleCron: z
    .string()
    .regex(/^(\*|[0-5]?\d) (\*|[01]?\d|2[0-3]) (\*|[1-9]|[12]\d|3[01]) (\*|[1-9]|1[0-2]) (\*|[0-6])$/, 
      "Invalid cron expression"),
})

export type TaskFormInput = z.infer<typeof TaskFormSchema>