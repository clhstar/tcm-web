import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
} from '../../api/conversation'

export const conversationKeys = {
  all: ['conversations'] as const,
  list: (pageSize: number) => ['conversations', 'list', { pageSize }] as const,
  detail: (id: number) => ['conversations', 'detail', id] as const,
}

export function useRecentConversations(pageSize = 30) {
  return useQuery({
    queryKey: conversationKeys.list(pageSize),
    queryFn: () => listConversations({ pageNum: 1, pageSize }),
  })
}

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: conversationKeys.detail(id ?? 0),
    queryFn: () => getConversation(id as number),
    enabled: id !== null,
  })
}

export function useRenameConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      renameConversation(id, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteConversation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
    },
  })
}
