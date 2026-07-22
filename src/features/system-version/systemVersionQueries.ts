import { useQuery } from '@tanstack/react-query'
import { getBackendVersions } from '../../api/systemVersion'

export const systemVersionKey = ['system-versions'] as const

export function useSystemVersions(enabled: boolean) {
  return useQuery({
    queryKey: systemVersionKey,
    queryFn: getBackendVersions,
    enabled,
    retry: false,
    staleTime: 10_000,
    refetchInterval: enabled ? 30_000 : false,
    refetchOnWindowFocus: true,
  })
}
