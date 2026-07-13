import type { FormEvent } from 'react'
import type { Patient } from '../../../api/patient'
import { MaterialIcon } from '../../../components/MaterialIcon'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { formatPatientMeta, maskPhone } from '../patientUtils'

type PatientDirectoryProps = {
  keyword: string
  page: number
  pageCount: number
  total: number
  patients: Patient[]
  isLoading: boolean
  errorMessage?: string
  onKeywordChange: (value: string) => void
  onSearch: (event: FormEvent<HTMLFormElement>) => void
  onCreate: () => void
  onSelect: (patient: Patient) => void
  onPreviousPage: () => void
  onNextPage: () => void
}

export function PatientDirectory({
  keyword,
  page,
  pageCount,
  total,
  patients,
  isLoading,
  errorMessage,
  onKeywordChange,
  onSearch,
  onCreate,
  onSelect,
  onPreviousPage,
  onNextPage,
}: PatientDirectoryProps) {
  return (
    <section className="patient-directory" aria-label="患者档案">
      <form className="patient-search" onSubmit={onSearch}>
        <label className="visually-hidden" htmlFor="patient-keyword">搜索患者</label>
        <div className="search-line">
          <input
            id="patient-keyword"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="姓名或手机号"
          />
          <button type="submit">
            <MaterialIcon name="search" />
            搜索
          </button>
          <button type="button" className="quiet-action compact-action patient-create-button" onClick={onCreate}>
            <MaterialIcon name="personAdd" />
            新增档案
          </button>
        </div>
      </form>

      {isLoading ? <p className="muted-line">正在加载患者档案...</p> : null}
      {errorMessage ? <p className="patient-directory-error" role="alert">{errorMessage}</p> : null}

      <div className="patient-list-meta">
        <strong>{total} 位患者</strong>
        <span>点击条目查看完整档案</span>
      </div>

      <div className="patient-list">
        {patients.length > 0 ? (
          <div className="patient-list-header" aria-hidden="true">
            <span>患者</span>
            <span>联系方式</span>
            <span />
          </div>
        ) : null}
        {patients.map((patient) => (
          <button
            type="button"
            key={patient.id}
            className="patient-row"
            onClick={() => onSelect(patient)}
            aria-label={`查看 ${patient.name}`}
          >
            <span>
              <strong>{patient.name}</strong>
              <small>{formatPatientMeta(patient)}</small>
            </span>
            <span className="patient-phone">{maskPhone(patient.phone)}</span>
            <MaterialIcon name="chevronRight" />
          </button>
        ))}
      </div>

      {!isLoading && patients.length === 0 ? (
        <EmptyState title="没有找到匹配患者" description="可以先新增一份患者档案。" />
      ) : null}

      {pageCount > 1 ? (
        <div className="pager" aria-label="患者列表分页">
          <button type="button" disabled={page <= 1} onClick={onPreviousPage}>
            <MaterialIcon name="arrowBack" />
            上一页
          </button>
          <span>{page} / {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={onNextPage}>
            下一页
            <MaterialIcon name="chevronRight" />
          </button>
        </div>
      ) : null}
    </section>
  )
}
