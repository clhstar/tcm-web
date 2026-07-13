import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'quiet'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  compact?: boolean
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'submit-button',
  secondary: 'ghost-button',
  quiet: 'quiet-action',
}

export function Button({
  children,
  className = '',
  compact = false,
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  const classes = [variantClasses[variant], compact ? 'compact' : '', className]
    .filter(Boolean)
    .join(' ')

  return <button {...props} type={type} className={classes}>{children}</button>
}
