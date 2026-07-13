import { Navigate, useNavigate, useParams } from 'react-router'
import type { PatientInput } from '../../../api/patient'
import { PatientForm } from '../PatientForm'
import { PanelHeading } from '../../../shared/ui/PanelHeading'
import { usePatient, useUpdatePatient } from '../patientQueries'
import { readPatientId } from '../patientRoutes'

export function PatientEditPage() {
  const navigate = useNavigate()
  const patientId = readPatientId(useParams().patientId)
  const patientQuery = usePatient(patientId)
  const updateMutation = useUpdatePatient(patientId ?? 0)

  if (patientId === null) return <Navigate to="/patients" replace />

  async function handleUpdate(input: PatientInput) {
    await updateMutation.mutateAsync(input)
    navigate(`/patients/${patientId}`, { replace: true })
  }

  return (
    <section className="workspace-surface">
      <section className="patient-focus-panel my-route">
        <PanelHeading title="编辑档案" description="修改后会同步到患者基础信息。" />
        {patientQuery.isPending ? <p className="muted-line">正在加载患者档案...</p> : null}
        {patientQuery.data ? (
          <PatientForm
            patient={patientQuery.data}
            submitLabel="保存修改"
            onCancel={() => navigate(`/patients/${patientId}`)}
            onSubmit={handleUpdate}
          />
        ) : null}
      </section>
    </section>
  )
}
