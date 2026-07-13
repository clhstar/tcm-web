import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Patient } from '../../api/patient'
import { NotificationProvider } from '../../components/Notification'
import { PatientForm } from './PatientForm'

const patient: Patient = {
  id: 12,
  name: '李女士',
  phone: '13900139000',
  gender: 'FEMALE',
  birthday: '1992-02-02',
  createTime: '2026-06-04 15:30:00',
  updateTime: '2026-06-04 15:30:00',
}

describe('PatientForm', () => {
  it('initializes from a patient and submits edited patient input', async () => {
    let resolveSubmit!: () => void
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve
        }),
    )
    const user = userEvent.setup()

    render(
      <PatientForm
        patient={patient}
        submitLabel="保存患者"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText('姓名')).toHaveValue('李女士')
    expect(screen.getByLabelText('手机号')).toHaveValue('13900139000')
    expect(screen.getByLabelText('性别')).toHaveValue('FEMALE')
    expect(screen.getByLabelText('出生日期')).toHaveValue('1992-02-02')

    await user.clear(screen.getByLabelText('姓名'))
    await user.type(screen.getByLabelText('姓名'), '李先生')
    await user.clear(screen.getByLabelText('手机号'))
    await user.type(screen.getByLabelText('手机号'), '13800138000')
    await user.selectOptions(screen.getByLabelText('性别'), 'MALE')
    await user.clear(screen.getByLabelText('出生日期'))
    await user.type(screen.getByLabelText('出生日期'), '1991-03-04')
    await user.click(screen.getByRole('button', { name: '保存患者' }))

    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled()
    expect(onSubmit).toHaveBeenCalledWith({
      name: '李先生',
      phone: '13800138000',
      gender: 'MALE',
      birthday: '1991-03-04',
    })

    resolveSubmit()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '保存患者' })).not.toBeDisabled(),
    )
  })

  it('shows backend submit errors and calls cancel handler', async () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn().mockRejectedValue(new Error('手机号已存在'))
    const user = userEvent.setup()

    render(
      <NotificationProvider>
        <PatientForm submitLabel="保存患者" onCancel={onCancel} onSubmit={onSubmit} />
      </NotificationProvider>,
    )

    expect(screen.getByLabelText('姓名')).toHaveValue('')
    expect(screen.getByLabelText('手机号')).toHaveValue('')
    expect(screen.getByLabelText('性别')).toHaveValue('UNKNOWN')
    expect(screen.getByLabelText('出生日期')).toHaveValue('')

    await user.type(screen.getByLabelText('姓名'), '李女士')
    await user.type(screen.getByLabelText('手机号'), '13900139000')
    await user.click(screen.getByRole('button', { name: '保存患者' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('手机号已存在')
    expect(error).toHaveClass('app-notification', 'error')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '保存患者' })).not.toBeDisabled(),
    )

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('preserves drafts for the same patient and resets when selected patient changes', async () => {
    const user = userEvent.setup()
    const refreshedPatient: Patient = {
      ...patient,
      name: '李女士（刷新）',
      updateTime: '2026-06-04 16:00:00',
    }
    const nextPatient: Patient = {
      ...patient,
      id: 13,
      name: '王先生',
      phone: '13800138000',
      gender: 'MALE',
      birthday: '1991-03-04',
    }

    const { rerender } = render(
      <PatientForm
        patient={patient}
        submitLabel="保存患者"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    await user.clear(screen.getByLabelText('姓名'))
    await user.type(screen.getByLabelText('姓名'), '尚未保存的草稿')

    rerender(
      <PatientForm
        patient={refreshedPatient}
        submitLabel="保存患者"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('姓名')).toHaveValue('尚未保存的草稿')

    rerender(
      <PatientForm
        patient={nextPatient}
        submitLabel="保存患者"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('姓名')).toHaveValue('王先生')
    expect(screen.getByLabelText('手机号')).toHaveValue('13800138000')
    expect(screen.getByLabelText('性别')).toHaveValue('MALE')
    expect(screen.getByLabelText('出生日期')).toHaveValue('1991-03-04')
  })
})
