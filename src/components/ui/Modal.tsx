import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose?: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Prevent closing via backdrop/Escape (e.g. mandatory onboarding). */
  dismissible?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ open, onClose, title, children, footer, dismissible = true, size = 'md' }: ModalProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement | null
    const focusable = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, button, [href], select, textarea')
    focusable?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        onClose?.()
      }
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (el) => !el.hasAttribute('disabled'),
        )
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      lastFocus.current?.focus?.()
    }
  }, [open, dismissible, onClose])

  if (!open) return null
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md'

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink-950/75 p-3 backdrop-blur-sm animate-fade-in sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose?.()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[calc(100dvh-1.5rem)] w-full ${width} flex-col overflow-hidden rounded-3xl border border-ink-600 bg-ink-800 shadow-2xl animate-pop`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 id={titleId} className="text-2xl font-bold leading-tight text-ink-100">
            {title}
          </h2>
          {dismissible && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 rounded-xl p-2 text-ink-300 hover:bg-white/5 hover:text-ink-100"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 text-ink-200">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-700 bg-ink-850 px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Yes', cancelLabel = 'Cancel', danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div>{message}</div>
    </Modal>
  )
}
