type EmptyStateProps = {
  title: string
  description?: string
  className?: string
}

export function EmptyState({ title, description, className = '' }: EmptyStateProps) {
  return (
    <div className={['empty-state', className].filter(Boolean).join(' ')}>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  )
}
