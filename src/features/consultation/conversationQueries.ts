import { useQuery } from '@tanstack/react-query'
import { listConsultations } from '../../api/consultation'

export const conversationKeys = {
  all: ['conversations'] as const,
  list: (pageSize: number) => ['conversations', 'list', { pageSize }] as const,
}

export function useRecentConversations(pageSize = 30) {
  return useQuery({
    queryKey: conversationKeys.list(pageSize),
    queryFn: () => listConsultations({ pageNum: 1, pageSize }),
  })
}
