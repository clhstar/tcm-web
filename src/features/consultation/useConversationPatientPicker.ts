import { useEffect, useRef, useState } from 'react'
import type { Notify } from '../../components/notificationContext'
import type { Patient } from '../../api/patient'
import { usePatients } from '../patient/patientQueries'

const PATIENT_PICKER_PAGE_SIZE = 10

type UseConversationPatientPickerInput = {
  routeConversationId: number | null
  notify: Notify
}

/**
 * 管理聊天工作区里的患者候选、默认选择和选择器开关。
 *
 * 问诊绑定规则不放在这里；是否允许关联或切换患者仍由问诊生命周期决定。
 */
export function useConversationPatientPicker({
  routeConversationId,
  notify,
}: UseConversationPatientPickerInput) {
  const patientQuery = usePatients(1, PATIENT_PICKER_PAGE_SIZE)
  const patients = patientQuery.data?.records ?? []
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const selectedPatientIdRef = useRef<number | null>(null)

  useEffect(() => {
    const firstPatient = patientQuery.data?.records[0]
    if (
      routeConversationId !== null ||
      !firstPatient ||
      selectedPatientIdRef.current !== null
    ) {
      return
    }
    selectedPatientIdRef.current = firstPatient.id
    setSelectedPatient(firstPatient)
  }, [patientQuery.data, routeConversationId])

  useEffect(() => {
    if (!patientQuery.error) return
    notify({
      type: 'error',
      title: '患者档案提示',
      message:
        patientQuery.error instanceof Error
          ? patientQuery.error.message
          : '患者列表加载失败，请稍后重试。',
    })
  }, [notify, patientQuery.error])

  return {
    patientQuery,
    patients,
    selectedPatient,
    setSelectedPatient,
    selectedPatientIdRef,
    isPickerOpen,
    openPicker: () => setIsPickerOpen(true),
    closePicker: () => setIsPickerOpen(false),
    isPatientLoading: patientQuery.isPending || patientQuery.isFetching,
  }
}
