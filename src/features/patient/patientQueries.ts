import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPatient,
  getPatient,
  listPatients,
  updatePatient,
  type PatientInput,
} from '../../api/patient'

export const patientKeys = {
  all: ['patients'] as const,
  detail: (id: number) => ['patients', 'detail', id] as const,
  list: (page: number, pageSize: number, keyword: string) =>
    ['patients', 'list', { page, pageSize, keyword }] as const,
}

export function usePatients(page: number, pageSize: number, keyword = '') {
  return useQuery({
    queryKey: patientKeys.list(page, pageSize, keyword),
    queryFn: () => listPatients({ page, pageSize, keyword }),
  })
}

export function usePatient(patientId: number | null) {
  return useQuery({
    queryKey: patientKeys.detail(patientId ?? 0),
    queryFn: () => getPatient(patientId as number),
    enabled: patientId !== null,
  })
}

export function useCreatePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PatientInput) => createPatient(input),
    onSuccess: (patient) => {
      queryClient.setQueryData(patientKeys.detail(patient.id), patient)
      void queryClient.invalidateQueries({ queryKey: patientKeys.all })
    },
  })
}

export function useUpdatePatient(patientId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PatientInput) => updatePatient(patientId, input),
    onSuccess: (patient) => {
      queryClient.setQueryData(patientKeys.detail(patient.id), patient)
      void queryClient.invalidateQueries({ queryKey: patientKeys.all })
    },
  })
}
