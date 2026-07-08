import { type FormEvent, useEffect, useState } from 'react'
import { MaterialIcon } from '../../components/MaterialIcon'
import { useNotification } from '../../components/notificationContext'
import type { Gender, Patient, PatientInput } from '../../api/patient'

type PatientFormProps = {
  patient?: Patient | null
  submitLabel: string
  onCancel: () => void
  onSubmit: (input: PatientInput) => Promise<void>
}

type PatientFormState = {
  name: string
  phone: string
  gender: Gender
  birthday: string
}

const FALLBACK_SUBMIT_ERROR = '保存失败，请稍后重试'

export function PatientForm({ patient, submitLabel, onCancel, onSubmit }: PatientFormProps) {
  return (
    <PatientFormFields
      key={patient ? patient.id : 'new'}
      patient={patient}
      submitLabel={submitLabel}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  )
}

function PatientFormFields({ patient, submitLabel, onCancel, onSubmit }: PatientFormProps) {
  const notify = useNotification()
  const [form, setForm] = useState<PatientFormState>(() => createInitialFormState(patient))
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!error) return
    notify({
      type: 'error',
      title: '档案保存失败',
      message: error,
    })
  }, [error, notify])

  function updateField<Field extends keyof PatientFormState>(
    field: Field,
    value: PatientFormState[Field],
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await onSubmit({
        name: form.name,
        phone: form.phone,
        gender: form.gender,
        birthday: form.birthday,
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : FALLBACK_SUBMIT_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="patient-form" onSubmit={handleSubmit}>
      <label htmlFor="patient-name">姓名</label>
      <input
        id="patient-name"
        value={form.name}
        onChange={(event) => updateField('name', event.target.value)}
        required
      />

      <label htmlFor="patient-phone">手机号</label>
      <input
        id="patient-phone"
        value={form.phone}
        onChange={(event) => updateField('phone', event.target.value)}
        required
      />

      <div className="form-grid">
        <div>
          <label htmlFor="patient-gender">性别</label>
          <select
            id="patient-gender"
            value={form.gender}
            onChange={(event) => updateField('gender', event.target.value as Gender)}
          >
            <option value="UNKNOWN">未知</option>
            <option value="MALE">男</option>
            <option value="FEMALE">女</option>
          </select>
        </div>

        <div>
          <label htmlFor="patient-birthday">出生日期</label>
          <input
            id="patient-birthday"
            type="date"
            value={form.birthday}
            onChange={(event) => updateField('birthday', event.target.value)}
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          <MaterialIcon name="close" />
          取消
        </button>
        <button type="submit" className="submit-button compact" disabled={isSubmitting}>
          <MaterialIcon name="save" />
          {isSubmitting ? '保存中...' : submitLabel}
        </button>
      </div>
    </form>
  )
}

function createInitialFormState(patient?: Patient | null): PatientFormState {
  return {
    name: patient?.name ?? '',
    phone: patient?.phone ?? '',
    gender: patient?.gender ?? 'UNKNOWN',
    birthday: patient?.birthday ?? '',
  }
}
