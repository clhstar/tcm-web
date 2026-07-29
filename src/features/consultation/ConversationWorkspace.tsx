import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { Conversation } from "../../api/conversation";
import { getPatient, type Patient } from "../../api/patient";
import { ConsultationChatPanel } from "./ConsultationChatPanel";
import { ConsultationSummaryPanel } from "./ConsultationSummaryPanel";
import { useNotification } from "../../components/notificationContext";
import { ArchiveSheet } from "../patient/components/ArchiveSheet";
import { useConversationPatientPicker } from "./useConversationPatientPicker";
import { useConsultationLifecycle } from "./useConsultationLifecycle";
import { useConsultationState } from "./useConsultationState";
import { useConversationSession } from "./useConversationSession";
import { ConversationStarter } from "./ConversationStarter";

export type WorkspaceView = "chat" | "summary";
type ConversationWorkspaceProps = {
  view?: WorkspaceView;
};

export function ConversationWorkspace({
  view = "chat",
}: ConversationWorkspaceProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeConversationId = readPositiveId(useParams().consultationId);
  const notify = useNotification();
  const {
    patientQuery,
    patients,
    selectedPatient,
    setSelectedPatient,
    selectedPatientIdRef,
    isPickerOpen: isArchiveSheetOpen,
    openPicker,
    closePicker,
    isPatientLoading,
  } = useConversationPatientPicker({ routeConversationId: routeConversationId, notify });
  const consultationState = useConsultationState();
  const {
    consultationContext,
    taggedPatient,
    showTagSuggestion,
  } = consultationState;
  const session = useConversationSession({
    taggedPatient,
    notify,
    resolvePatient: resolveConversationPatient,
    restoreConsultation: consultationState.restore,
    clearConsultation: consultationState.clear,
    acceptConsultationContext: consultationState.acceptContext,
    onPatientResolved: synchronizeSelectedPatient,
    onTagSuggestion: consultationState.revealTagSuggestion,
  });
  const consultationLifecycle = useConsultationLifecycle({
    state: consultationState,
    session,
    notify,
    showError: showConsultationError,
  });
  const {
    conversation: activeConversation,
    messageDraft,
    setMessageDraft,
    historyLoadError,
    isConversationLoading: isConsultationLoading,
    isMessageLoading,
    isCreatingConversation,
    fileRefreshKey,
    messages,
    eventsByMessageId: tcmFlowEventsByMessageId,
    collaborationByMessageId,
    isSending: isSendingMessage,
    isRunActionPending,
    isRunBlocking,
    runId,
    runStatus,
  } = session;

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [isDraftingConversation, setIsDraftingConversation] = useState(false);
  const [, setConsultationError] = useState("");
  const newConversationTokenRef = useRef<string | null>(null);
  const activeView = view;

  useEffect(() => {
    if (
      routeConversationId === null ||
      session.isCurrentConversation(routeConversationId)
    )
      return;
    void session.loadById(routeConversationId).then(() => {
      setIsDraftingConversation(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Route identity owns this load lifecycle.
  }, [routeConversationId]);

  useEffect(() => {
    if (
      routeConversationId !== null ||
      location.pathname === "/consultation/new"
    )
      return;
    void session.loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Route identity owns this load lifecycle.
  }, [location.pathname, routeConversationId]);

  useEffect(() => {
    const token =
      location.pathname === "/consultation/new"
        ? location.key
        : new URLSearchParams(location.search).get("new");
    if (!token || newConversationTokenRef.current === token) {
      return;
    }
    newConversationTokenRef.current = token;
    openNewConsultationDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.pathname, location.search]);

  function showConsultationError(message: string) {
    setConsultationError(message);
    notify({
      type: "error",
      title: "问诊提示",
      message,
    });
  }

  async function resolveConversationPatient(
    conversation: Conversation
  ): Promise<Patient | null> {
    if (conversation.patientId === null) return null;
    const cachedPatient = patientQuery.data?.records.find(
      (patient) => patient.id === conversation.patientId
    );
    return cachedPatient ?? getPatient(conversation.patientId);
  }

  function synchronizeSelectedPatient(patient: Patient | null) {
    selectedPatientIdRef.current = patient?.id ?? null;
    setSelectedPatient(patient);
  }

  function selectPatientFromSheet(patient: Patient) {
    if (
      consultationContext?.status === "COMPLETED" ||
      consultationContext?.status === "CANCELLED"
    ) {
      closePicker();
      showConsultationError("当前问诊已经结束，请新建对话后再添加问诊标签。");
      return;
    }
    if (
      activeConversation?.patientId &&
      activeConversation.patientId !== patient.id
    ) {
      showConsultationError("当前对话已绑定其他患者，请新建对话后再切换。");
      return;
    }
    consultationState.attachPatient(patient);
    closePicker();
  }

  function openCreateForm() {
    closePicker();
    navigate("/patients/new");
  }

  function openNewConsultationDraft() {
    if (location.pathname !== "/consultation/new") {
      navigate(`/consultation/new?new=${Date.now()}`);
      return;
    }
    consultationLifecycle.reset();
    setChiefComplaint("");
    setConsultationError("");
    session.resetDraft();
    setIsDraftingConversation(true);
  }

  function answerWithoutArchive() {
    closePicker();
    if (
      activeConversation &&
      taggedPatient &&
      consultationContext?.status === "IN_PROGRESS"
    ) {
      void consultationLifecycle.pause();
      return;
    }
    consultationState.removeLocalTag();
  }

  async function handleStartConsultation() {
    const normalizedComplaint = chiefComplaint.trim();
    if (!normalizedComplaint) {
      showConsultationError("请先记录本次主诉，再开始问诊。");
      return;
    }

    setConsultationError("");
    await session.startConversation({
      initialMessage: normalizedComplaint,
      selectedPatientId: selectedPatient?.id,
      onCreated: (conversation) => {
        setChiefComplaint("");
        setIsDraftingConversation(false);
        navigate(`/consultation/${conversation.id}`, { replace: true });
      },
    });
  }

  async function handleRenameConversation(id: number, title: string) {
    await session.rename(id, title);
  }

  async function handleDeleteConversation(id: number) {
    if (await session.remove(id)) openNewConsultationDraft();
  }

  const archiveLabel = selectedPatient
    ? `问诊患者：${selectedPatient.name}`
    : "选择档案";
  const isConsultationStarter =
    activeView === "chat" && (isDraftingConversation || !activeConversation);

  return (
    <section
      className={
        isConsultationStarter
          ? "workspace-surface consultation-surface is-starter"
          : "workspace-surface"
      }
    >
      <section
        className={[
          "workspace-grid",
          isConsultationStarter ? "consultation-starter-grid" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <section
          className={
            activeView === "chat"
              ? "single-module-panel chat-shell-panel"
              : "single-module-panel"
          }
          aria-label="当前接诊患者"
        >
          {activeView === "chat" ? (
            <div
              className={
                isConsultationStarter
                  ? "consultation-workspace chat-route starter-route"
                  : "consultation-workspace chat-route"
              }
            >
              {isDraftingConversation || !activeConversation ? (
                <ConversationStarter
                  archiveLabel={archiveLabel}
                  initialMessage={chiefComplaint}
                  isCreating={isCreatingConversation}
                  taggedPatient={taggedPatient}
                  onChange={setChiefComplaint}
                  onOpenPatientPicker={openPicker}
                  onRemoveTag={consultationState.removeLocalTag}
                  onSubmit={() => void handleStartConsultation()}
                />
              ) : null}

              {activeConversation && !isDraftingConversation ? (
                <ConsultationChatPanel
                  consultation={activeConversation}
                  messages={messages}
                  draft={messageDraft}
                  archiveLabel={archiveLabel}
                  errorMessage={historyLoadError}
                  isLoading={
                    isConsultationLoading ||
                    isMessageLoading ||
                    consultationLifecycle.isCompleting
                  }
                  isSending={isSendingMessage}
                  isRunActionPending={isRunActionPending}
                  isRunBlocking={isRunBlocking}
                  canControlRun={runId !== null}
                  runStatus={runStatus}
                  tcmFlowEventsByMessageId={tcmFlowEventsByMessageId}
                  collaborationByMessageId={collaborationByMessageId}
                  taggedPatient={taggedPatient}
                  consultationContext={consultationContext}
                  fileRefreshKey={fileRefreshKey}
                  showTagSuggestion={showTagSuggestion}
                  isControllingConsultation={consultationLifecycle.isControlling}
                  onDraftChange={setMessageDraft}
                  onOpenArchiveSheet={openPicker}
                  onRemoveTag={consultationLifecycle.pause}
                  onAddSuggestedTag={() =>
                    selectedPatient &&
                    consultationState.attachPatient(selectedPatient)
                  }
                  onComplete={consultationLifecycle.complete}
                  onCancel={consultationLifecycle.cancel}
                  onCancelRun={session.cancelCurrentRun}
                  onRetryHistory={() => {
                    if (activeConversation) {
                      void session.loadMessages(activeConversation.id);
                    }
                  }}
                  onResumeRun={session.resumeCurrentRun}
                  onRetryRun={session.retryCurrentRun}
                  onSend={session.sendMessage}
                  onRename={handleRenameConversation}
                  onDelete={handleDeleteConversation}
                />
              ) : null}
            </div>
          ) : null}

          {activeView === "summary" ? (
            <div className="consultation-workspace">
              <ConsultationSummaryPanel
                consultation={activeConversation}
                isCompleting={consultationLifecycle.isCompleting}
                isLoading={
                  isConsultationLoading || isMessageLoading || isSendingMessage
                }
                onComplete={consultationLifecycle.complete}
              />
            </div>
          ) : null}
        </section>
      </section>
      <ArchiveSheet
        isOpen={isArchiveSheetOpen}
        patients={patients}
        selectedPatient={taggedPatient}
        isLoading={isPatientLoading}
        onClose={closePicker}
        onSelect={selectPatientFromSheet}
        onCreate={openCreateForm}
        onAnswerWithoutArchive={answerWithoutArchive}
      />
    </section>
  );
}

function readPositiveId(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
