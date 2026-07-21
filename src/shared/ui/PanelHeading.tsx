export function PanelHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  )
}
