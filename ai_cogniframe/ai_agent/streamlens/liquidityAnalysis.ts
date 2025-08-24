import { toolkitBuilder } from "@/ai/core"
import { FETCH_POOL_DATA_KEY } from "@/ai/modules/liquidity/pool-fetcher/key"
import { ANALYZE_POOL_HEALTH_KEY } from "@/ai/modules/liquidity/health-checker/key"
import { FetchPoolDataAction } from "@/ai/modules/liquidity/pool-fetcher/action"
import { AnalyzePoolHealthAction } from "@/ai/modules/liquidity/health-checker/action"

type Toolkit = ReturnType<typeof toolkitBuilder>

/** stable tool namespaces for consistent discovery in logs and UIs */
const NS = {
  poolData: "liquidityscan",
  poolHealth: "poolhealth",
} as const

/** literal-safe key builder so typos are caught at compile time */
type Namespace = typeof NS[keyof typeof NS]
type FetchKey = typeof FETCH_POOL_DATA_KEY
type HealthKey = typeof ANALYZE_POOL_HEALTH_KEY
type ToolId =
  | `${typeof NS.poolData}-${FetchKey}`
  | `${typeof NS.poolHealth}-${HealthKey}`

const composeKey = <N extends Namespace, K extends string>(ns: N, key: K) =>
  `${ns}-${key}` as `${N}-${K}`

/** optional DI surface to swap actions in tests or specialized builds */
export interface LiquidityToolDeps {
  fetchAction?: FetchPoolDataAction
  healthAction?: AnalyzePoolHealthAction
}

/** single place that constructs all toolkits */
export function buildLiquidityTools(deps: LiquidityToolDeps = {}) {
  const fetchAction = deps.fetchAction ?? new FetchPoolDataAction()
  const healthAction = deps.healthAction ?? new AnalyzePoolHealthAction()

  const tools = {
    [composeKey(NS.poolData, FETCH_POOL_DATA_KEY)]: toolkitBuilder(fetchAction),
    [composeKey(NS.poolHealth, ANALYZE_POOL_HEALTH_KEY)]: toolkitBuilder(healthAction),
  } satisfies Record<ToolId, Toolkit>

  return Object.freeze(tools)
}

/** exported instance for immediate use */
export const LIQUIDITY_ANALYSIS_TOOLS = buildLiquidityTools()

/** individual ids exported for routing or whitelists */
export const LIQUIDITY_TOOL_IDS = Object.freeze({
  poolData: composeKey(NS.poolData, FETCH_POOL_DATA_KEY),
  poolHealth: composeKey(NS.poolHealth, ANALYZE_POOL_HEALTH_KEY),
})
