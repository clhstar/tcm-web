import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteConsultation,
  listConsultations,
  renameConsultation,
} from '../../api/consultation'

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

export function useRenameConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      renameConsultation(id, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteConsultation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
    },
  })
}
