import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { PatientDirectory } from '../components/PatientDirectory'
import { usePatients } from '../patientQueries'

const PAGE_SIZE = 10

export function PatientDirectoryPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [activeKeyword, setActiveKeyword] = useState('')
  const [page, setPage] = useState(1)
  const patientQuery = usePatients(page, PAGE_SIZE, activeKeyword)
  const result = patientQuery.data
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE))

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setActiveKeyword(keyword.trim())
  }

  return (
    <section className="workspace-surface patient-directory-surface">
      <section className="patient-focus-panel">
        <PatientDirectory
          keyword={keyword}
          page={page}
          pageCount={pageCount}
          total={result?.total ?? 0}
          patients={result?.records ?? []}
          isLoading={patientQuery.isPending || patientQuery.isFetching}
          errorMessage={patientQuery.error instanceof Error ? patientQuery.error.message : undefined}
          onKeywordChange={setKeyword}
          onSearch={handleSearch}
          onCreate={() => navigate('/patients/new')}
          onSelect={(patient) => navigate(`/patients/${patient.id}`)}
          onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
          onNextPage={() => setPage((current) => Math.min(pageCount, current + 1))}
        />
      </section>
    </section>
  )
}
