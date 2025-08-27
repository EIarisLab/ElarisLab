import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import SentimentGauge from "./SentimentGauge"
import AssetOverviewPanel from "./AssetOverviewPanel"
import WhaleTrackerCard from "./WhaleTrackerCard"
import { fetchDashboardData, DashboardData } from "../services/dashboardService"
import { Spinner } from "@/components/ui/spinner"

export interface ElarisDashboardProps {
  /** Token symbols to display */
  symbols?: string[]
  /** Asset IDs for overview panels */
  assetIds?: string[]
  /** Optional auto-refresh interval in ms (disabled by default) */
  refreshMs?: number
  /** Optional custom title override */
  title?: string
}

export const ElarisDashboard: React.FC<ElarisDashboardProps> = ({
  symbols = ["ELR"],
  assetIds = ["ELR-01"],
  refreshMs,
  title,
}) => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // stable refs to prevent race conditions on rapid prop changes/unmounts
  const activeAbort = useRef<AbortController | null>(null)
  const reqSeq = useRef(0)
  const isMounted = useRef(true)

  // normalize inputs once to avoid effect churn on equal arrays
  const normSymbols = useMemo(() => [...new Set(symbols)].filter(Boolean), [symbols])
  const normAssetIds = useMemo(() => [...new Set(assetIds)].filter(Boolean), [assetIds])

  const load = useCallback(async () => {
    // cancel previous in-flight request
    if (activeAbort.current) activeAbort.current.abort()
    const controller = new AbortController()
    activeAbort.current = controller

    const seq = ++reqSeq.current
    setLoading(true)
    setError(null)

    try {
      const next = await fetchDashboardData(normSymbols, normAssetIds, { signal: controller.signal })
      // ignore stale responses
      if (!isMounted.current || seq !== reqSeq.current) return
      setData(next)
    } catch (err: any) {
      if (controller.signal.aborted) return
      console.error("Dashboard fetch error:", err)
      setError(err?.message || "Failed to load dashboard data")
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [normSymbols, normAssetIds])

  // initial and prop-driven load
  useEffect(() => {
    isMounted.current = true
    load()
    return () => {
      isMounted.current = false
      if (activeAbort.current) activeAbort.current.abort()
    }
  }, [load])

  // optional auto-refresh with clean teardown
  useEffect(() => {
    if (!refreshMs || refreshMs <= 0) return
    const id = setInterval(() => {
      void load()
    }, refreshMs)
    return () => clearInterval(id)
  }, [refreshMs, load])

  // derived safe getters to avoid optional chaining cascades
  const sentimentBySymbol = data?.sentiment ?? {}
  const assetsById = data?.assets ?? {}
  const whaleMovements = data?.whaleMovements ?? []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8" role="status" aria-live="polite">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-red-600">
        <p className="text-center">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-red-50"
          aria-label="Retry loading dashboard data"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl font-bold">
          {title ?? data?.title ?? "Elaris Analytics Dashboard"}
        </h1>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          aria-label="Refresh dashboard"
        >
          Refresh
        </button>
      </div>

      {/* Empty states if upstream returns no entries */}
      {normSymbols.length === 0 && normAssetIds.length === 0 ? (
        <div className="rounded-md bg-white p-6 shadow-sm">
          <p className="text-gray-600">No symbols or assets specified</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {normSymbols.map((symbol) => (
            <SentimentGauge
              key={symbol}
              symbol={symbol}
              sentiment={sentimentBySymbol[symbol]}
            />
          ))}

          {normAssetIds.map((assetId) => (
            <AssetOverviewPanel
              key={assetId}
              assetId={assetId}
              overview={assetsById[assetId]}
            />
          ))}

          <WhaleTrackerCard whaleMovements={whaleMovements} />
        </div>
      )}
    </div>
  )
}

export default React.memo(ElarisDashboard)
