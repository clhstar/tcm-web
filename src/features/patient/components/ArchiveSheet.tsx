import type { Patient } from '../../../api/patient'
import { MaterialIcon } from '../../../components/MaterialIcon'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { IconButton } from '../../../shared/ui/IconButton'
import { genderLabel, getAge, maskName, maskPhone } from '../patientUtils'

type ArchiveSheetProps = {
  isOpen: boolean
  patients: Patient[]
  selectedPatient: Patient | null
  isLoading: boolean
  onClose: () => void
  onSelect: (patient: Patient) => void
  onCreate: () => void
  onAnswerWithoutArchive: () => void
}

export function ArchiveSheet({
  isOpen,
  patients,
  selectedPatient,
  isLoading,
  onClose,
  onSelect,
  onCreate,
  onAnswerWithoutArchive,
}: ArchiveSheetProps) {
  if (!isOpen) return null

  return (
    <div className="archive-sheet-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="archive-sheet" role="dialog" aria-modal="true" aria-label="选择档案">
        <div className="archive-sheet-header">
          <h2>选择档案</h2>
          <IconButton icon="close" label="关闭选择档案" className="archive-sheet-close" onClick={onClose} />
        </div>

        <div className="archive-sheet-list">
          {patients.map((patient) => {
            const isSelected = selectedPatient?.id === patient.id
            return (
              <article key={patient.id} className="archive-option-card">
                <div>
                  <strong>{maskName(patient.name)}</strong>
                  <p>{genderLabel(patient.gender)}{patient.birthday ? ` · ${getAge(patient.birthday) ?? '-'}岁` : ''} · {maskPhone(patient.phone)}</p>
                </div>
                <button type="button" disabled={isSelected} onClick={() => onSelect(patient)}>
                  {isSelected ? '已选择' : '选择'}
                </button>
              </article>
            )
          })}
        </div>

        {isLoading ? <p className="muted-line">正在加载患者档案...</p> : null}
        {!isLoading && patients.length === 0 ? (
          <EmptyState title="暂时没有档案" description="可以先新建档案后再开始问诊。" />
        ) : null}

        <div className="archive-sheet-actions">
          <Button onClick={onAnswerWithoutArchive}>
            <MaterialIcon name="chat" />
            不结合档案回答
          </Button>
          <Button variant="primary" compact onClick={onCreate}>
            <MaterialIcon name="personAdd" />
            新建档案
          </Button>
        </div>
      </section>
    </div>
  )
}
