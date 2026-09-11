import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export type Granularity = 'day' | 'week' | 'month'

export interface AnalyticsSummary {
  pageviews: number
  visitors: number
  sessions: number
  bounceRate: number
  avgSessionSeconds: number
}
export interface TimeseriesPoint {
  date: string
  pageviews: number
  visitors: number
}
export interface Breakdown {
  label: string
  count: number
}
export interface TopPage {
  path: string
  pageviews: number
  visitors: number
}
export interface AnalyticsReport {
  from: string
  to: string
  granularity: Granularity
  summary: AnalyticsSummary
  timeseries: TimeseriesPoint[]
  topPages: TopPage[]
  sources: Breakdown[]
  devices: Breakdown[]
  browsers: Breakdown[]
  os: Breakdown[]
}

export function useAnalyticsReport(params: { from: string; to: string; granularity: Granularity }) {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
  }).toString()
  return useQuery({
    queryKey: ['analytics', 'report', params.from, params.to, params.granularity] as const,
    queryFn: () => apiFetch<AnalyticsReport>(`/api/admin/analytics/report?${qs}`),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}
