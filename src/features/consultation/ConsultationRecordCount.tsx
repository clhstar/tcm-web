import { useRecentConversations } from './conversationQueries'
import { hasConsultationRecord } from './conversationMode'

export function ConsultationRecordCount() {
  const conversationQuery = useRecentConversations(50)
  const recordCount = (conversationQuery.data?.records ?? []).filter(
    hasConsultationRecord,
  ).length

  return <span className="consultation-record-count">{recordCount} 条记录</span>
}
