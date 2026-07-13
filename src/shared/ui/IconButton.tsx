import type { ButtonHTMLAttributes } from 'react'
import { MaterialIcon, type MaterialIconName } from '../../components/MaterialIcon'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: MaterialIconName
  label: string
}

export function IconButton({ icon, label, className = 'icon-button', type = 'button', ...props }: IconButtonProps) {
  return (
    <button {...props} type={type} className={className} aria-label={label} title={label}>
      <MaterialIcon name={icon} />
    </button>
  )
}
