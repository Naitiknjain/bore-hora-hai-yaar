import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-[transform,background-color,box-shadow,opacity] duration-150 active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100 select-none whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary: 'bg-masala text-ink-950 hover:bg-[#ffdc66] shadow-[0_4px_0_0_#c99500] active:shadow-[0_1px_0_0_#c99500] active:translate-y-[3px]',
  secondary: 'bg-ink-700 text-ink-100 hover:bg-ink-600 border border-ink-600',
  ghost: 'bg-transparent text-ink-200 hover:bg-white/5',
  danger: 'bg-lal text-white hover:brightness-110',
  success: 'bg-pudina text-ink-950 hover:brightness-105',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-[15px]',
  lg: 'min-h-13 px-6 text-lg',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', icon, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  )
})

interface LinkButtonProps extends LinkProps {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export function LinkButton({ variant = 'primary', size = 'md', icon, className = '', children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, className as string)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-11 items-center justify-center rounded-xl bg-ink-700/80 text-ink-100 transition hover:bg-ink-600 active:scale-95 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
