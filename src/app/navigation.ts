import type { MaterialIconName } from '../components/MaterialIcon'
import type { BreadcrumbItem } from '../shared/ui/Breadcrumb'

export type NavigationItem = {
  label: string
  description: string
  icon: MaterialIconName
  to: string
  match: string[]
}

export const navigationItems: NavigationItem[] = [
  { label: '问诊工作台', description: '实时对话与智能协作', icon: 'chat', to: '/consultation', match: ['/consultation'] },
  { label: '历史记录', description: '归档问诊与状态追踪', icon: 'history', to: '/history', match: ['/history', '/summary'] },
  { label: '患者档案', description: '患者资料与检索管理', icon: 'group', to: '/patients', match: ['/patients'] },
  { label: '知识库', description: '证据、古籍与检索边界', icon: 'libraryBooks', to: '/knowledge', match: ['/knowledge'] },
  { label: '系统设置', description: '账号、偏好与安全', icon: 'settings', to: '/settings', match: ['/settings'] },
]

export function getPageTitle(pathname: string) {
  if (pathname.startsWith('/summary') || pathname.includes('/summary')) return '问诊总结'
  if (pathname.startsWith('/history')) return '历史问诊记录'
  if (pathname.startsWith('/patients')) return '患者档案'
  if (pathname.startsWith('/knowledge')) return '知识库'
  if (pathname.startsWith('/settings')) return '系统设置'
  return '问诊工作台'
}

export function getBreadcrumbItems(pathname: string, search: string): BreadcrumbItem[] {
  if (pathname.startsWith('/summary') || pathname.includes('/summary')) {
    return [{ label: '历史问诊记录', to: '/history' }, { label: '问诊总结' }]
  }
  if (pathname.startsWith('/patients')) {
    const parent = { label: '患者档案', to: '/patients' }
    if (pathname === '/patients/new') return [parent, { label: '新增档案' }]
    const editMatch = pathname.match(/^\/patients\/([^/]+)\/edit$/)
    if (editMatch) {
      return [
        parent,
        { label: '档案详情', to: `/patients/${editMatch[1]}` },
        { label: '编辑档案' },
      ]
    }
    if (/^\/patients\/[^/]+$/.test(pathname)) return [parent, { label: '档案详情' }]
    const patientMode = new URLSearchParams(search).get('mode')
    if (patientMode === 'create') return [parent, { label: '新增档案' }]
    if (patientMode === 'edit') return [parent, { label: '编辑档案' }]
    if (patientMode === 'profile') return [parent, { label: '档案详情' }]
  }
  return [{ label: getPageTitle(pathname) }]
}
