
import React from "react"
import SentimentGauge from "./SentimentGauge"
import AssetOverviewPanel from "./AssetOverviewPanel"


export const ElarisDashboard: React.FC = () => (
  <div className="p-8 bg-gray-100 min-h-screen">
    <h1 className="text-4xl font-bold mb-6">Elaris Analytics Dashboard</h1>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <SentimentGauge symbol="ELR" />
      <AssetOverviewPanel assetId="ELR-01" />
      <WhaleTrackerCard />
    </div>
  </div>
)

export default ElarisDashboard
