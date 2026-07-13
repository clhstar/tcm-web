import type { Patient } from '../../../api/patient'
import { MaterialIcon } from '../../../components/MaterialIcon'
import { Button } from '../../../shared/ui/Button'
import { genderLabel, getAge } from '../patientUtils'

export function PatientProfileCard({
  patient,
  onBack,
  onEdit,
}: {
  patient: Patient
  onBack: () => void
  onEdit: () => void
}) {
  const age = patient.birthday ? getAge(patient.birthday) : null

  return (
    <section className="patient-summary-card" aria-label="患者档案详情">
      <div className="patient-profile">
        <div className="patient-avatar" aria-hidden="true">{patient.name.slice(0, 1)}</div>
        <div>
          <h2>{patient.name}</h2>
          <p>{genderLabel(patient.gender)}{age !== null ? ` · ${age}岁` : ''}</p>
        </div>
      </div>
      <dl className="patient-details">
        <div><dt>手机号</dt><dd>{patient.phone}</dd></div>
        <div><dt>出生日期</dt><dd>{patient.birthday || '未记录'}</dd></div>
      </dl>
      <div className="focus-actions">
        <Button onClick={onBack}>
          <MaterialIcon name="arrowBack" />
          返回列表
        </Button>
        <Button variant="primary" compact onClick={onEdit}>
          <MaterialIcon name="edit" />
          编辑资料
        </Button>
      </div>
    </section>
  )
}
