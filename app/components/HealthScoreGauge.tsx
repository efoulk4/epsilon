'use client'

interface HealthScoreGaugeProps {
  score: number
  label: string
  color: string
}

export function HealthScoreGauge({
  score,
  label,
  color,
}: HealthScoreGaugeProps) {
  const radius = 70
  const strokeWidth = 12
  const normalizedRadius = radius - strokeWidth / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (score / 100) * circumference

  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className="relative">
        <svg height={radius * 2} width={radius * 2}>
          {/* Background circle */}
          <circle
            stroke="#E1E3E5"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          {/* Progress circle */}
          <circle
            stroke={color}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference + ' ' + circumference}
            style={{
              strokeDashoffset,
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
              transition: 'stroke-dashoffset 0.5s ease',
            }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <div className="text-3xl font-bold" style={{ color }}>
            {score}
          </div>
          <div className="text-xs text-gray-600">/ 100</div>
        </div>
      </div>
      <div className="mt-4 text-center">
        <div className="text-sm font-semibold" style={{ color }}>
          {label}
        </div>
        <div className="text-xs text-gray-600 mt-1">Health Score</div>
      </div>
    </div>
  )
}
