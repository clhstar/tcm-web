import type { Patient } from '../../api/patient'

export function genderLabel(gender: Patient['gender']) {
  if (gender === 'MALE') return '男'
  if (gender === 'FEMALE') return '女'
  return '未知'
}

export function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2')
}

export function maskName(name: string) {
  const normalizedName = name.trim()
  if (normalizedName.length <= 1) return normalizedName || '患者'
  return `*${normalizedName.slice(-1)}`
}

export function formatPatientMeta(patient: Patient) {
  const age = patient.birthday ? getAge(patient.birthday) : null
  return [genderLabel(patient.gender), age ? `${age}岁` : null].filter(Boolean).join(' · ')
}

export function getAge(birthday: string) {
  const date = new Date(birthday)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const birthdayThisYear = new Date(now.getFullYear(), date.getMonth(), date.getDate())
  if (birthdayThisYear > now) age -= 1
  return Math.max(0, age)
}
