import React, { useEffect, useState } from "react"
import { DEFAULT_SCAN_INTERVAL } from "../config"

interface AssetOverviewPanelProps {
  assetId: string
}

interface AssetOverview {
  name: string
  priceUsd: number
  supply: number
  holders: number
}

export const AssetOverviewPanel: React.FC<AssetOverviewPanelProps> = ({ assetId }) => {
  const [info, setInfo] = useState<AssetOverview | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    const fetchInfo = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/elaris/assets/${encodeURIComponent(assetId)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`Error ${res.status}`)
        const json: AssetOverview = await res.json()
        if (isMounted) setInfo(json)
      } catch (err: any) {
        if (isMounted) setError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchInfo()
    const interval = setInterval(fetchInfo, DEFAULT_SCAN_INTERVAL)

    return () => {
      isMounted = false
      controller.abort()
      clearInterval(interval)
    }
  }, [assetId])

  if (loading) {
    return <div className="p-4 text-gray-500">Loading asset overview…</div>
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        Failed to load asset overview: {error}
      </div>
    )
  }

  if (!info) {
    return null
  }

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-semibold mb-2">Asset Overview</h2>
      <p>
        <span className="font-medium">ID:</span> {assetId}
      </p>
      <p>
        <span className="font-medium">Name:</span> {info.name}
      </p>
      <p>
        <span className="font-medium">Price (USD):</span> $
        {info.priceUsd.toFixed(2)}
      </p>
      <p>
        <span className="font-medium">Circulating Supply:</span>{" "}
        {info.supply.toLocaleString()}
      </p>
      <p>
        <span className="font-medium">Holders:</span>{" "}
        {info.holders.toLocaleString()}
      </p>
    </div>
  )
}

export default AssetOverviewPanel
