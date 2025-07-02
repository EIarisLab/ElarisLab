

import type { TaskFormInput } from "./taskFormSchemas"
import { TaskFormSchema } from "./taskFormSchemas"




/**
 * Processes a Typeform webhook payload to schedule a new Elaris task.
 */
export async function handleTypeformSubmission(raw: unknown): Promise<{ success: boolean; message: string }> {
  const parsed = TaskFormSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, message: `Validation error: ${parsed.error.issues.map(i => i.message).join("; ")}` }
  }

  const { taskName, taskType, parameters, scheduleCron } = parsed.data


 

  return { success: true, message: `Task "${taskName}" scheduled with ID` }
}
