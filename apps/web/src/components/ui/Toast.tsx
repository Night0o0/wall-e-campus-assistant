import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastTone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const tones: Record<ToastTone, string> = {
  success: 'border-success-500 text-success-700',
  error: 'border-danger-500 text-danger-700',
  info: 'border-primary-500 text-primary-700',
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId++
      setToasts((current) => [...current, { id, tone, message }])
      setTimeout(() => dismiss(id), 4500)
    },
    [dismiss]
  )

  const value = useMemo(
    () => ({
      notify,
      success: (message: string) => notify(message, 'success'),
      error: (message: string) => notify(message, 'error'),
    }),
    [notify]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = icons[toast.tone]

          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-lg border-l-4 bg-white p-4 card-shadow-lg',
                tones[toast.tone]
              )}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="flex-1 text-sm text-slate-700">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="text-slate-400 transition-colors hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider')
  }

  return context
}
