import { Navigate, useNavigate, useParams } from 'react-router'
import { PatientProfileCard } from '../components/PatientProfileCard'
import { usePatient } from '../patientQueries'
import { readPatientId } from '../patientRoutes'
import { EmptyState } from '../../../shared/ui/EmptyState'

export function PatientProfilePage() {
  const navigate = useNavigate()
  const patientId = readPatientId(useParams().patientId)
  const patientQuery = usePatient(patientId)

  if (patientId === null) return <Navigate to="/patients" replace />

  return (
    <section className="workspace-surface">
      <section className="patient-focus-panel">
        {patientQuery.isPending ? <p className="muted-line">正在加载患者档案...</p> : null}
        {patientQuery.error instanceof Error ? <EmptyState title="档案加载失败" description={patientQuery.error.message} /> : null}
        {patientQuery.data ? (
          <PatientProfileCard
            patient={patientQuery.data}
            onBack={() => navigate('/patients')}
            onEdit={() => navigate(`/patients/${patientId}/edit`)}
          />
        ) : null}
      </section>
    </section>
  )
}
