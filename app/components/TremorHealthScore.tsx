'use client'

import { Card, DonutChart, Metric, Text } from '@tremor/react'

interface TremorHealthScoreProps {
  score: number
  label: string
  color: string
}

export function TremorHealthScore({ score, label }: TremorHealthScoreProps) {
  // Determine color based on score
  const getColor = (score: number) => {
    if (score >= 90) return 'emerald'
    if (score >= 70) return 'blue'
    if (score >= 50) return 'yellow'
    return 'red'
  }

  const data = [
    {
      name: 'Health Score',
      value: score,
    },
    {
      name: 'Remaining',
      value: 100 - score,
    },
  ]

  return (
    <Card className="max-w-sm">
      <div className="flex flex-col items-center justify-center space-y-4">
        <DonutChart
          data={data}
          category="value"
          index="name"
          colors={[getColor(score), 'slate']}
          className="w-40 h-40"
          showLabel={false}
          showAnimation={true}
        />
        <div className="text-center">
          <Metric>{score}/100</Metric>
          <Text className="mt-1">{label}</Text>
          <Text className="text-tremor-content-subtle">Health Score</Text>
        </div>
      </div>
    </Card>
  )
}
