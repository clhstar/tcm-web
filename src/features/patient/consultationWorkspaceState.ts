import type { Consultation, ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'

export type ConsultationWorkspaceState = {
  consultationContext: ConsultationContext | null
  taggedPatient: Patient | null
  showTagSuggestion: boolean
}

/**
 * A message starts or resumes a consultation only when the user has explicitly
 * attached a patient tag to that message.
 */
export function messagePatientId(taggedPatient: Patient | null): number | undefined {
  return taggedPatient?.id
}

export function isContextForActiveConversation(
  activeConversationId: number | null,
  sourceConversationId: number,
): boolean {
  return activeConversationId === sourceConversationId
}

/**
 * Restore the persisted consultation context without recreating a tag that the
 * user removed to pause the consultation.
 */
export function restoreConversationState(
  consultation: Consultation,
  patient: Patient | null,
): ConsultationWorkspaceState {
  const consultationContext = consultation.consultationContext ?? null
  const taggedPatient =
    consultationContext?.status === 'IN_PROGRESS' &&
    patient !== null &&
    consultation.patientId === patient.id
      ? patient
      : null

  return { consultationContext, taggedPatient, showTagSuggestion: false }
}

/** Apply the authoritative context returned by a stream or control endpoint. */
export function applyConsultationContext(
  consultationContext: ConsultationContext,
  taggedPatient: Patient | null,
): ConsultationWorkspaceState {
  return {
    consultationContext,
    taggedPatient: consultationContext.status === 'IN_PROGRESS' ? taggedPatient : null,
    showTagSuggestion: false,
  }
}

/** A newly opened conversation never inherits state from the previous one. */
export function emptyConversationState(): ConsultationWorkspaceState {
  return { consultationContext: null, taggedPatient: null, showTagSuggestion: false }
}
