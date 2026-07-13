import type { Consultation } from '../../../api/consultation'
import type { Patient } from '../../../api/patient'
import { MaterialIcon } from '../../../components/MaterialIcon'
import { genderLabel, getAge } from '../patientUtils'

type PatientContextPanelProps = {
  patient: Patient | null
  consultation: Consultation | null
  consultationCount: number
  isLoading: boolean
  onOpenArchiveSheet: () => void
  onOpenProfile: () => void
  onStartNew: () => void
}

export function PatientContextPanel({
  patient,
  consultation,
  consultationCount,
  isLoading,
  onOpenArchiveSheet,
  onOpenProfile,
  onStartNew,
}: PatientContextPanelProps) {
  const age = patient?.birthday ? getAge(patient.birthday) : null

  return (
    <aside className="patient-context-panel" aria-label="患者和问诊信息">
      <div className="context-card-title"><p className="status-label">患者 / 问诊信息</p></div>
      <div className="context-profile">
        <div className="patient-avatar" aria-hidden="true">{patient ? patient.name.slice(0, 1) : '患'}</div>
        <div>
          <strong>{patient?.name ?? '请选择患者'}</strong>
          <span>{patient ? genderLabel(patient.gender) : '档案未绑定'}{age !== null ? ` · ${age}岁` : ''}</span>
        </div>
      </div>
      <dl className="context-metrics">
        <div><dt>当前状态</dt><dd>{consultation?.statusName || (patient ? '待创建问诊' : '未选择')}</dd></div>
        <div><dt>历史问诊</dt><dd>{patient ? `${consultationCount} 条` : '-'}</dd></div>
        <div><dt>最后更新</dt><dd>{consultation?.updateTime || consultation?.createTime || '暂无'}</dd></div>
        <div><dt>主诉</dt><dd>{consultation?.chiefComplaint || '未记录'}</dd></div>
      </dl>
      <div className="context-actions">
        <button type="button" className="ghost-button" onClick={onOpenArchiveSheet}><MaterialIcon name="swapHoriz" />切换患者</button>
        <button type="button" className="ghost-button" onClick={onOpenProfile} disabled={!patient}><MaterialIcon name="visibility" />查看档案</button>
        {consultation ? (
          <button type="button" className="submit-button compact" onClick={onStartNew} disabled={isLoading}><MaterialIcon name="add" />新建对话</button>
        ) : null}
      </div>
    </aside>
  )
}
