import { MaterialIcon } from '../../components/MaterialIcon'

export type BreadcrumbItem = {
  label: string
  to?: string
}

export function Breadcrumb({
  items,
  onNavigate,
}: {
  items: BreadcrumbItem[]
  onNavigate: (target: string) => void
}) {
  return (
    <nav className="page-breadcrumb" aria-label="页面位置">
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1
        return (
          <span className="breadcrumb-item" key={`${item.label}-${index}`}>
            {index > 0 ? <MaterialIcon name="chevronRight" /> : null}
            {item.to && !isCurrent ? (
              <button type="button" className="breadcrumb-link" onClick={() => onNavigate(item.to as string)}>
                {item.label}
              </button>
            ) : (
              <span aria-current={isCurrent ? 'page' : undefined}>{item.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
