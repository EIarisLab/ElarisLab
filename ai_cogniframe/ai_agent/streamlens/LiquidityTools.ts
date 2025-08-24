import { toolkitBuilder } from "@/ai/core"
import { FetchPoolDataAction } from "@/ai/modules/liquidity/pool-fetcher/action"
import { AnalyzePoolHealthAction } from "@/ai/modules/liquidity/health-checker/action"
import { FETCH_POOL_DATA_KEY, ANALYZE_POOL_HEALTH_KEY } from "@/ai/modules/liquidity/keys"

type Toolkit = ReturnType<typeof toolkitBuilder>

const poolDataToolkit = toolkitBuilder(new FetchPoolDataAction())
const poolHealthToolkit = toolkitBuilder(new AnalyzePoolHealthAction())

export const EXTENDED_LIQUIDITY_TOOLS: Record<string, Toolkit> = Object.freeze({
  [`liquidityscan-${FETCH_POOL_DATA_KEY}`]: poolDataToolkit,
  [`poolhealth-${ANALYZE_POOL_HEALTH_KEY}`]: poolHealthToolkit,
})
