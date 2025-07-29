import React, { useState, useEffect } from "react"
import SentimentGauge from "./SentimentGauge"
import AssetOverviewPanel from "./AssetOverviewPanel"
import WhaleTrackerCard from "./WhaleTrackerCard"
import { fetchDashboardData, DashboardData } from "../services/dashboardService"
import { Spinner } from "@/components/ui/spinner"

export interface ElarisDashboardProps {
  symbols?: string[]               // token symbols to display (defaults to ['ELR'])
  assetIds?: string[]              // asset IDs for overview panels
}

export const ElarisDashboard: React.FC<ElarisDashboardProps> = ({
  symbols = ["ELR"],
  assetIds = ["ELR-01"],
}) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetchDashboardData(symbols, assetIds)
      .then(data => {
        setDashboardData(data)
      })
      .catch(err => {
        console.error("Dashboard fetch error:", err)
        setError("Failed to load dashboard data")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [symbols, assetIds])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-8">
        {error}
      </div>
    )
  }

  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <h1 className="text-4xl font-bold mb-6">
        {dashboardData?.title ?? "Elaris Analytics Dashboard"}
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {symbols.map(symbol => (
          <SentimentGauge
            key={symbol}
            symbol={symbol}
            sentiment={dashboardData?.sentiment[symbol]}
          />
        ))}

        {assetIds.map(assetId => (
          <AssetOverviewPanel
            key={assetId}
            assetId={assetId}
            overview={dashboardData?.assets[assetId]}
          />
        ))}

        <WhaleTrackerCard
          whaleMovements={dashboardData?.whaleMovements}
        />
      </div>
    </div>
  )
}

export default ElarisDashboard
