/**
 * 通用对话 API。
 *
 * 后端当前仍由历史模块 `consultation.ts` 提供实现；这里建立面向业务调用方的
 * Conversation 语义边界，避免普通聊天继续依赖 Consultation 命名。问诊状态与
 * 问诊控制接口仍从 `consultation.ts` 引用。
 */
export {
  cancelConsultationRun as cancelConversationRun,
  createConsultation as createConversation,
  deleteConsultation as deleteConversation,
  deleteConsultationFile as deleteConversationFile,
  downloadConsultationFile as downloadConversationFile,
  getConsultation as getConversation,
  getConsultationRunStatus as getConversationRunStatus,
  getCurrentConsultationRun as getCurrentConversationRun,
  listConsultationFiles as listConversationFiles,
  listConsultationMessages as listConversationMessages,
  listConsultations as listConversations,
  renameConsultation as renameConversation,
  resumeConsultationRun as resumeConversationRun,
  retryConsultationRun as retryConversationRun,
  streamConsultationRun as streamConversationRun,
  uploadConsultationFile as uploadConversationFile,
} from './consultation'

export type {
  Consultation as Conversation,
  ConsultationCreateInput as ConversationCreateInput,
  ConsultationMessage as ConversationMessage,
  ConsultationPage as ConversationPage,
  ConsultationRunStatus as ConversationRunStatus,
  ConversationFile,
  ConversationFileDownload,
  StreamConsultationRunInput as StreamConversationRunInput,
  StreamConsultationRunResult as StreamConversationRunResult,
  TcmFlowMessage,
  TcmFlowSseEvent,
} from './consultation'
