import { useNavigate } from 'react-router'
import type { PatientInput } from '../../../api/patient'
import { PatientForm } from '../PatientForm'
import { PanelHeading } from '../../../shared/ui/PanelHeading'
import { useCreatePatient } from '../patientQueries'

export function PatientCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreatePatient()

  async function handleCreate(input: PatientInput) {
    const patient = await createMutation.mutateAsync(input)
    navigate(`/patients/${patient.id}`, { replace: true })
  }

  return (
    <section className="workspace-surface">
      <section className="patient-focus-panel my-route">
        <PanelHeading title="新增档案" description="只记录接诊前必须确认的基础信息。" />
        <PatientForm submitLabel="保存患者" onCancel={() => navigate('/patients')} onSubmit={handleCreate} />
      </section>
    </section>
  )
}
