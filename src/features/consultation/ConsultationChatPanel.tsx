import { Fragment, type FormEvent, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MaterialIcon } from "../../components/MaterialIcon";
import type {
  Conversation,
  ConversationFile,
  ConversationMessage,
  ConversationRunStatus,
} from "../../api/conversation";
import type { ConsultationContext } from "../../api/consultation";
import type { Patient } from "../../api/patient";
import type { CollaborationStatus, CollaborationStep } from "./collaboration";
import type {
  TcmFlowEventsByMessageId,
  TcmFlowToolEvent,
} from "./tcmFlowHistory";
import {
  ConsultationComposerFiles,
  ConsultationMessageArtifacts,
} from "./ConsultationFilesPanel";
import { useConversationFiles } from "./useConversationFiles";
import { ConversationActions } from "./ConversationActionsMenu";
import { ConsultationOfferCard } from "./ConsultationOfferCard";
import {
  consultationMessageKind,
  isConsultationTimelineMessage,
} from "./consultationTimeline";

const TCM_FLOW_PENDING_MESSAGE = "正在连接 tcm-flow...";
const COLLABORATION_STATUS_LABELS: Readonly<
  Record<CollaborationStatus, string>
> = {
  pending: "等待执行",
  running: "正在执行",
  completed: "已完成",
  skipped: "本轮未执行",
  failed: "执行失败",
};

type ConsultationChatPanelProps = {
  consultation: Conversation | null;
  messages: ConversationMessage[];
  draft: string;
  archiveLabel: string;
  errorMessage: string;
  isLoading: boolean;
  isSending: boolean;
  isRunActionPending: boolean;
  isRunBlocking: boolean;
  canControlRun: boolean;
  runStatus: ConversationRunStatus | null;
  tcmFlowEventsByMessageId: TcmFlowEventsByMessageId;
  collaborationByMessageId: Record<number, CollaborationStep[]>;
  taggedPatient: Patient | null;
  suggestedPatient: Patient | null;
  consultationContext: ConsultationContext | null;
  isControllingConsultation: boolean;
  fileRefreshKey?: number;
  consultationOfferMessageId: number | null;
  onDraftChange: (value: string) => void;
  onOpenArchiveSheet: () => void;
  onOpenManualConsultation: () => void;
  onRemoveTag: () => Promise<void>;
  onStartConsultation: (sourceComplaint: string) => Promise<void>;
  onContinueConversation: () => void;
  onCancelRun: () => Promise<void>;
  onRetryHistory: () => void;
  onResumeRun: () => Promise<void>;
  onRetryRun: () => Promise<void>;
  onSend: () => Promise<void>;
  onRename?: (id: number, title: string) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
};

export function ConsultationChatPanel({
  consultation,
  messages,
  draft,
  archiveLabel,
  errorMessage,
  isLoading,
  isSending,
  isRunActionPending,
  isRunBlocking,
  canControlRun,
  runStatus,
  tcmFlowEventsByMessageId,
  collaborationByMessageId,
  taggedPatient,
  suggestedPatient,
  consultationContext,
  isControllingConsultation,
  fileRefreshKey = 0,
  consultationOfferMessageId,
  onDraftChange,
  onOpenArchiveSheet,
  onOpenManualConsultation,
  onRemoveTag,
  onStartConsultation,
  onContinueConversation,
  onCancelRun,
  onRetryHistory,
  onResumeRun,
  onRetryRun,
  onSend,
  onRename,
  onDelete,
}: ConsultationChatPanelProps) {
  const [expandedThinkingMessageId, setExpandedThinkingMessageId] = useState<
    number | null
  >(null);
  const [expandedCollaborationMessageId, setExpandedCollaborationMessageId] =
    useState<number | null>(null);
  const [dismissedConsultationOffers, setDismissedConsultationOffers] =
    useState<Set<string>>(() => new Set());
  const latestAssistantMessageId = [...messages]
    .reverse()
    .find((message) => message.role === "ASSISTANT")?.id;
  const fileWorkspace = useConversationFiles(
    consultation?.id ?? null,
    consultation ? `${consultation.id}:${fileRefreshKey}` : "no-consultation"
  );
  const uploadedFiles = fileWorkspace.files.filter(
    (file) => file.kind === "upload"
  );
  const messageArtifacts = groupArtifactsByAssistantMessage(
    fileWorkspace.files,
    messages
  );
  const hasStartNode = messages.some(
    (message) =>
      consultationMessageKind(message.content) === "CONSULTATION_START"
  );
  const isTerminalConsultation =
    consultationContext?.status === "COMPLETED" ||
    consultationContext?.status === "CANCELLED";

  /* eslint-disable react-hooks/set-state-in-effect -- Expansion state intentionally follows the stream lifecycle. */
  useEffect(() => {
    if (isSending && latestAssistantMessageId !== undefined) {
      setExpandedCollaborationMessageId(latestAssistantMessageId);
      return;
    }
    setExpandedCollaborationMessageId(null);
  }, [isSending, latestAssistantMessageId]);

  useEffect(() => {
    if (isSending && latestAssistantMessageId !== undefined) {
      setExpandedThinkingMessageId(latestAssistantMessageId);
      return;
    }
    setExpandedThinkingMessageId(null);
  }, [isSending, latestAssistantMessageId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSend();
  }

  return (
    <section
      className="consultation-card consultation-chat-panel"
      aria-label="当前问诊"
    >
      <div className="consultation-panel-header">
        <div className="consultation-title-cluster">
          <h3>{consultation?.chiefComplaint || "尚未开始问诊"}</h3>
          {consultation && onRename && onDelete ? (
            <ConversationTitleActions
              consultation={consultation}
              onRename={onRename}
              onDelete={onDelete}
            />
          ) : (
            <span className="consultation-title-more" aria-hidden="true">
              <span className="conversation-more-dots" aria-hidden="true">
                ...
              </span>
            </span>
          )}
        </div>
        <strong>
          {consultationContext
            ? statusLabel(consultationContext.status)
            : consultation?.statusName || "待创建"}
        </strong>
      </div>

      {consultation ? (
        <>
          {isLoading ? <p className="muted-line">正在同步问诊消息...</p> : null}

          <div
            className={
              errorMessage && messages.length === 0
                ? "consultation-chat-body has-empty-error"
                : "consultation-chat-body"
            }
          >
            {errorMessage ? (
              <div className="consultation-inline-error" role="alert">
                <MaterialIcon name="error" />
                <div>
                  <strong>问诊记录暂时未完整载入</strong>
                  <p>{errorMessage}</p>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={onRetryHistory}
                  disabled={isLoading}
                >
                  {isLoading ? "重试中..." : "重新载入"}
                </button>
              </div>
            ) : null}
            <div className="consultation-chat-stream">
              {consultationContext && !hasStartNode ? (
                <ConsultationTimelineNode
                  kind="CONSULTATION_START"
                  patientName={
                    consultation.patientName ?? suggestedPatient?.name ?? null
                  }
                  consultationId={consultation.id}
                />
              ) : null}
              {messages.map((message, messageIndex) => {
                const messageEvents =
                  tcmFlowEventsByMessageId[message.id] ?? [];
                const collaborationSteps =
                  collaborationByMessageId[message.id] ?? [];
                const isLatestAssistantMessage =
                  message.id === latestAssistantMessageId;
                const consultationOfferKey = [
                  consultation.id,
                  messageIndex,
                  message.content,
                ].join(":");
                const hasLaterUserMessage = messages
                  .slice(messageIndex + 1)
                  .some((candidate) => candidate.role === "USER");
                const isConsultationOffer =
                  !consultationContext &&
                  !hasLaterUserMessage &&
                  !dismissedConsultationOffers.has(consultationOfferKey) &&
                  (message.id === consultationOfferMessageId ||
                    message.suggestedAction === "add_consultation_tag");
                const shouldShowCollaboration =
                  message.role === "ASSISTANT" && collaborationSteps.length > 0;
                const shouldShowThinkingProcess =
                  message.role === "ASSISTANT" &&
                  !shouldShowCollaboration &&
                  (messageEvents.length > 0 ||
                    (isLatestAssistantMessage && isSending));

                return (
                  <Fragment key={message.id}>
                    {shouldShowCollaboration ? (
                      <CollaborationProcess
                        detailsId={`collaboration-process-${message.id}`}
                        steps={collaborationSteps}
                        isExpanded={
                          expandedCollaborationMessageId === message.id
                        }
                        isStreaming={isLatestAssistantMessage && isSending}
                        onToggle={() =>
                          setExpandedCollaborationMessageId((current) =>
                            current === message.id ? null : message.id
                          )
                        }
                      />
                    ) : shouldShowThinkingProcess ? (
                      <ThinkingProcess
                        detailsId={`thinking-process-${message.id}`}
                        eventCount={messageEvents.length}
                        events={messageEvents}
                        isExpanded={expandedThinkingMessageId === message.id}
                        isStreaming={isLatestAssistantMessage && isSending}
                        onToggle={() =>
                          setExpandedThinkingMessageId((current) =>
                            current === message.id ? null : message.id
                          )
                        }
                      />
                    ) : null}

                    {isConsultationOffer ? null : isConsultationTimelineMessage(
                        message
                      ) ? (
                      <ConsultationTimelineNode
                        kind={consultationMessageKind(message.content)}
                        patientName={
                          consultation.patientName ??
                          suggestedPatient?.name ??
                          null
                        }
                        consultationId={consultation.id}
                      />
                    ) : (
                      <article
                        className={
                          message.role === "USER"
                            ? "message-bubble user"
                            : "message-bubble assistant"
                        }
                      >
                        {isPendingAssistantMessage(message) ? (
                          <TypingIndicator />
                        ) : (
                          <MessageContent
                            message={message}
                            artifacts={messageArtifacts.get(message.id) ?? []}
                            isFileBusy={fileWorkspace.isBusy}
                            onDownload={fileWorkspace.download}
                          />
                        )}
                      </article>
                    )}

                    {isConsultationOffer ? (
                      <ConsultationOfferCard
                        patient={suggestedPatient}
                        disabled={isLoading || isRunBlocking}
                        onSwitchPatient={onOpenArchiveSheet}
                        onStart={() =>
                          void (async () => {
                            dismissConsultationOffer(
                              consultationOfferKey,
                              setDismissedConsultationOffers
                            );
                            await onStartConsultation(
                              findConsultationSourceComplaint(
                                messages,
                                messageIndex
                              )
                            );
                          })()
                        }
                        onContinue={() => {
                          dismissConsultationOffer(
                            consultationOfferKey,
                            setDismissedConsultationOffers
                          );
                          onContinueConversation();
                        }}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
              {consultationContext &&
              consultationContext.status !== "IN_PROGRESS" ? (
                <ConsultationTimelineNode
                  kind={consultationContext.status}
                  patientName={
                    consultation.patientName ?? suggestedPatient?.name ?? null
                  }
                  consultationId={consultation.id}
                />
              ) : null}
            </div>
          </div>

          <form className="consultation-message-form" onSubmit={handleSubmit}>
            <RunGovernanceControl
              isActionPending={isRunActionPending}
              canControl={canControlRun}
              status={runStatus}
              onCancel={onCancelRun}
              onResume={onResumeRun}
              onRetry={onRetryRun}
            />
            <div className="message-input-shell archive-input-shell consultation-composer-shell consultation-conversation-composer">
              <label
                className="visually-hidden"
                htmlFor="consultation-message-input"
              >
                发送消息
              </label>
              <textarea
                id="consultation-message-input"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !isLoading &&
                    !isRunBlocking
                  ) {
                    event.preventDefault();
                    void onSend();
                  }
                }}
                placeholder={
                  taggedPatient ? "请输入本轮问诊补充信息" : "随心输入"
                }
                disabled={isLoading || isRunBlocking}
                rows={2}
              />
              <div className="consultation-composer-actions conversation-composer-actions">
                <div className="conversation-composer-left">
                  <ConsultationComposerFiles
                    files={uploadedFiles}
                    disabled={isLoading || isRunBlocking}
                    isBusy={fileWorkspace.isBusy}
                    error={fileWorkspace.error}
                    compact
                    onUpload={fileWorkspace.upload}
                    onRemove={fileWorkspace.remove}
                  />
                  <div className="message-archive-row">
                    {isTerminalConsultation ? (
                      <span className="archive-consult-chip consultation-tag-chip consultation-terminal-chip">
                        <MaterialIcon name="info" />
                        问诊已结束
                      </span>
                    ) : taggedPatient ? (
                      <span className="archive-consult-chip consultation-tag-chip is-switchable">
                        <button
                          type="button"
                          className="consultation-tag-patient-button"
                          aria-label={`切换问诊患者，当前${taggedPatient.name}`}
                          title="点击切换患者"
                          onClick={onOpenManualConsultation}
                          disabled={
                            isLoading ||
                            isRunBlocking ||
                            isControllingConsultation
                          }
                        >
                          <MaterialIcon name="medicalServices" />
                          问诊·{taggedPatient.name}
                        </button>
                        <button
                          type="button"
                          className="consultation-tag-remove-button"
                          aria-label="关闭主动问诊"
                          onClick={() => void onRemoveTag()}
                          disabled={
                            isLoading ||
                            isRunBlocking ||
                            isControllingConsultation
                          }
                        >
                          <MaterialIcon name="close" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="archive-consult-chip"
                        aria-label="主动开启问诊"
                        title={archiveLabel}
                        onClick={onOpenManualConsultation}
                        disabled={
                          isLoading ||
                          isRunBlocking ||
                          isControllingConsultation
                        }
                      >
                        <MaterialIcon name="add" />
                        问诊
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type={isSending && canControlRun ? "button" : "submit"}
                  className={`message-send-button consultation-composer-submit${
                    isSending && canControlRun ? " is-stop" : ""
                  }`}
                  disabled={
                    isSending && canControlRun
                      ? isRunActionPending
                      : isLoading || isRunBlocking
                  }
                  aria-label={
                    isSending && canControlRun ? "停止生成" : "发送消息"
                  }
                  title={isSending && canControlRun ? "停止生成" : "发送消息"}
                  onClick={
                    isSending && canControlRun
                      ? () => void onCancelRun()
                      : undefined
                  }
                >
                  {isSending && canControlRun ? (
                    <span className="message-stop-icon" aria-hidden="true" />
                  ) : (
                    <MaterialIcon name="send" />
                  )}
                </button>
              </div>
            </div>
          </form>
        </>
      ) : (
        <div className="empty-state roomy consultation-empty">
          <strong>先开始一条新的问诊</strong>
          <p>记录主诉后，消息区会自动切换为本次问诊会话。</p>
        </div>
      )}
    </section>
  );
}

/** 问诊建议只关联同一回复之前最近的一条普通用户消息。 */
function findConsultationSourceComplaint(
  messages: ConversationMessage[],
  assistantMessageIndex: number
) {
  for (let index = assistantMessageIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "USER" && !isConsultationTimelineMessage(message)) {
      return message.content.trim();
    }
  }
  return "";
}

/** 记住本次界面中用户已处理的建议，避免历史对账后因消息 ID 变化再次出现。 */
function dismissConsultationOffer(
  offerKey: string,
  setDismissedOffers: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  setDismissedOffers((current) => {
    const next = new Set(current);
    next.add(offerKey);
    return next;
  });
}

function ConsultationTimelineNode({
  kind,
  patientName,
  consultationId,
}: {
  kind:
    | NonNullable<ConversationMessage["displayKind"]>
    | "PAUSED"
    | "COMPLETED"
    | "CANCELLED";
  patientName: string | null;
  consultationId: number;
}) {
  if (kind === "MESSAGE") return null;

  const content = {
    CONSULTATION_START: {
      icon: "medicalServices" as const,
      title: "问诊已开始",
      description: patientName
        ? `本次问诊已绑定患者 ${patientName}`
        : "本次问诊已开始采集信息",
    },
    CONSULTATION_RESUME: {
      icon: "history" as const,
      title: "继续问诊",
      description: "已恢复此前保存的问诊进度",
    },
    PAUSED: {
      icon: "history" as const,
      title: "问诊已暂停",
      description: "已采集的信息已经保存",
    },
    COMPLETED: {
      icon: "checkCircle" as const,
      title: "问诊已完成",
      description: "问诊结果已经生成",
    },
    CANCELLED: {
      icon: "close" as const,
      title: "问诊已取消",
      description: "本次问诊已结束，不会继续采集",
    },
  }[kind];

  return (
    <section
      className={`consultation-timeline-node kind-${kind.toLowerCase()}`}
      aria-label={content.title}
    >
      <span className="consultation-timeline-line" aria-hidden="true" />
      <span className="consultation-timeline-icon" aria-hidden="true">
        <MaterialIcon name={content.icon} />
      </span>
      <div>
        <strong>{content.title}</strong>
        <small>{content.description}</small>
      </div>
      {kind === "COMPLETED" ? (
        <a href={`/consultation-records/${consultationId}`}>查看问诊结果</a>
      ) : null}
    </section>
  );
}

function ConversationTitleActions({
  consultation,
  onRename,
  onDelete,
}: {
  consultation: Conversation;
  onRename: (id: number, title: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const title = consultation.chiefComplaint?.trim() || "新对话";

  return (
    <ConversationActions
      consultation={consultation}
      title={title}
      onRename={onRename}
      onDelete={onDelete}
    >
      {({ setTriggerElement, openFromButton }) => (
        <button
          ref={setTriggerElement}
          type="button"
          className="consultation-title-more"
          aria-label={`打开对话菜单：${title}`}
          title="对话菜单"
          onClick={openFromButton}
        >
          <span className="conversation-more-dots" aria-hidden="true">
            ...
          </span>
        </button>
      )}
    </ConversationActions>
  );
}

function RunGovernanceControl({
  isActionPending,
  canControl,
  status,
  onCancel,
  onResume,
  onRetry,
}: {
  isActionPending: boolean;
  canControl: boolean;
  status: ConversationRunStatus | null;
  onCancel: () => Promise<void>;
  onResume: () => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const visible =
    status?.status === "interrupted" || status?.status === "error";
  if (!visible) return null;

  const label = runGovernanceLabel(status);
  const detail =
    status && status.max_attempts > 0
      ? `第 ${status.attempt}/${status.max_attempts} 次执行`
      : null;
  const canAbandonInterrupted = canControl && status?.status === "interrupted";

  return (
    <div
      className={`run-governance-status run-governance-${
        status?.status ?? "running"
      }`}
      role="status"
    >
      <div>
        <MaterialIcon name={status?.status === "error" ? "error" : "history"} />
        <span>
          <strong>{label}</strong>
          {detail ? <small>{detail}</small> : null}
        </span>
      </div>
      <div className="run-governance-actions">
        {canAbandonInterrupted ? (
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={isActionPending}
          >
            放弃任务
          </button>
        ) : null}
        {status?.status === "interrupted" && status.resumable ? (
          <button
            type="button"
            className="primary"
            onClick={() => void onResume()}
            disabled={isActionPending}
          >
            继续任务
          </button>
        ) : null}
        {status?.status === "error" && status.retryable ? (
          <button
            type="button"
            className="primary"
            onClick={() => void onRetry()}
            disabled={isActionPending}
          >
            重试
          </button>
        ) : null}
      </div>
    </div>
  );
}

function runGovernanceLabel(status: ConversationRunStatus | null) {
  switch (status?.status) {
    case "interrupted":
      return status.resumable
        ? "任务已中断，可从检查点继续"
        : "任务已中断，恢复次数已用尽";
    case "error":
      return status.retryable
        ? "本次任务执行失败，可重试"
        : "本次任务执行失败，重试次数已用尽";
    default:
      return "运行状态已更新";
  }
}

function statusLabel(status: ConsultationContext["status"]) {
  return {
    IN_PROGRESS: "问诊中",
    PAUSED: "问诊已暂停",
    COMPLETED: "问诊已完成",
    CANCELLED: "问诊已取消",
  }[status];
}

function CollaborationProcess({
  detailsId,
  steps,
  isExpanded,
  isStreaming,
  onToggle,
}: {
  detailsId: string;
  steps: CollaborationStep[];
  isExpanded: boolean;
  isStreaming: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="thinking-process-block collaboration-process-block">
      <button
        type="button"
        className="thinking-process-trigger collaboration-process-trigger"
        aria-label="多智能体协作"
        aria-controls={detailsId}
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <span>
          <strong>多智能体协作</strong>
          <small>{isStreaming ? "协作进行中" : "协作已完成"}</small>
        </span>
        <em>{steps.length} 个角色</em>
      </button>
      {isExpanded ? (
        <CollaborationDetails id={detailsId} steps={steps} />
      ) : null}
    </div>
  );
}

function CollaborationDetails({
  id,
  steps,
}: {
  id: string;
  steps: CollaborationStep[];
}) {
  return (
    <section
      id={id}
      className="thinking-process-details collaboration-process-details"
      aria-label="多智能体协作步骤"
    >
      <ol className="collaboration-steps">
        {steps.map((step) => (
          <li key={step.id} className={`collaboration-step ${step.status}`}>
            <div>
              <strong>{step.label}</strong>
              <span>{COLLABORATION_STATUS_LABELS[step.status]}</span>
            </div>
            <p>{step.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MessageContent({
  message,
  artifacts,
  isFileBusy,
  onDownload,
}: {
  message: ConversationMessage;
  artifacts: ConversationFile[];
  isFileBusy: boolean;
  onDownload: (file: ConversationFile) => Promise<void>;
}) {
  if (message.role === "ASSISTANT") {
    return (
      <>
        <div className="assistant-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
        <ConsultationMessageArtifacts
          files={artifacts}
          isBusy={isFileBusy}
          onDownload={onDownload}
        />
      </>
    );
  }

  return <p>{message.content}</p>;
}

function groupArtifactsByAssistantMessage(
  files: ConversationFile[],
  messages: ConversationMessage[]
) {
  const grouped = new Map<number, ConversationFile[]>();
  const assistantMessages = messages.filter(
    (message) =>
      message.role === "ASSISTANT" && !isPendingAssistantMessage(message)
  );

  for (const file of files) {
    if (file.kind !== "artifact" || file.name.endsWith(".manifest.json"))
      continue;
    const target = [...assistantMessages]
      .reverse()
      .find((message) => message.content.includes(file.name));
    if (!target) continue;
    grouped.set(target.id, [...(grouped.get(target.id) ?? []), file]);
  }

  return grouped;
}

function isPendingAssistantMessage(message: ConversationMessage) {
  return (
    message.role === "ASSISTANT" && message.content === TCM_FLOW_PENDING_MESSAGE
  );
}

function TypingIndicator() {
  return (
    <p>
      <span
        className="assistant-typing-indicator"
        role="status"
        aria-label="助手正在回复"
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </span>
    </p>
  );
}

function ThinkingProcess({
  detailsId,
  eventCount,
  events,
  isExpanded,
  isStreaming,
  onToggle,
}: {
  detailsId: string;
  eventCount: number;
  events: TcmFlowToolEvent[];
  isExpanded: boolean;
  isStreaming: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="thinking-process-block">
      <button
        type="button"
        className="thinking-process-trigger"
        aria-label="思考过程"
        aria-controls={detailsId}
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <span>
          <strong>{isStreaming ? "正在处理" : "已处理"}</strong>
          <small>{eventCount > 0 ? `${eventCount} 个步骤` : "等待步骤"}</small>
        </span>
        <MaterialIcon
          name="chevronRight"
          className={isExpanded ? "material-icon is-expanded" : "material-icon"}
        />
      </button>
      {isExpanded ? (
        <ThinkingProcessDetails
          id={detailsId}
          events={events}
          isStreaming={isStreaming}
        />
      ) : null}
    </div>
  );
}

function ThinkingProcessDetails({
  id,
  events,
  isStreaming,
}: {
  id: string;
  events: TcmFlowToolEvent[];
  isStreaming: boolean;
}) {
  return (
    <section id={id} className="thinking-process-details" aria-label="思考步骤">
      <div className="thinking-process-header">
        <div>
          <strong>当前过程</strong>
          <span>
            {isStreaming ? "正在分析患者描述和可用证据" : "已完成分析"}
          </span>
        </div>
        <small>
          {events.length > 0 ? `${events.length} 个步骤` : "等待 tcm-flow 事件"}
        </small>
      </div>
      {events.length > 0 ? (
        <ol className="thinking-process-steps">
          {events.map((event) => (
            <li key={event.id}>
              <span>{event.tool || event.type}</span>
              <p>{event.summary}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="thinking-process-empty">
          正在等待 tcm-flow 返回工具调用...
        </p>
      )}
    </section>
  );
}
