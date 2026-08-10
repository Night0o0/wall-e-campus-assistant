import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'
import { cn } from '../../lib/utils'

const controlStyles =
  'w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 transition-colors ' +
  'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'

const errorStyles = 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20'

interface FieldWrapperProps {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  htmlFor?: string
  children: ReactNode
  className?: string
}

function FieldWrapper({
  label,
  error,
  hint,
  required,
  htmlFor,
  children,
  className,
}: FieldWrapperProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-danger-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  wrapperClassName?: string
}

export function Input({
  label,
  error,
  hint,
  required,
  className,
  wrapperClassName,
  ...props
}: InputProps) {
  const generatedId = useId()
  const id = props.id ?? generatedId

  return (
    <FieldWrapper
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={id}
      className={wrapperClassName}
    >
      <input
        {...props}
        id={id}
        aria-invalid={Boolean(error)}
        className={cn(controlStyles, 'h-10', error && errorStyles, className)}
      />
    </FieldWrapper>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  wrapperClassName?: string
  children: ReactNode
}

export function Select({
  label,
  error,
  hint,
  required,
  className,
  wrapperClassName,
  children,
  ...props
}: SelectProps) {
  const generatedId = useId()
  const id = props.id ?? generatedId

  return (
    <FieldWrapper
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={id}
      className={wrapperClassName}
    >
      <select
        {...props}
        id={id}
        className={cn(controlStyles, 'h-10', error && errorStyles, className)}
      >
        {children}
      </select>
    </FieldWrapper>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  wrapperClassName?: string
}

export function Textarea({
  label,
  error,
  hint,
  required,
  className,
  wrapperClassName,
  ...props
}: TextareaProps) {
  const generatedId = useId()
  const id = props.id ?? generatedId

  return (
    <FieldWrapper
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={id}
      className={wrapperClassName}
    >
      <textarea
        {...props}
        id={id}
        className={cn(controlStyles, 'py-2', error && errorStyles, className)}
      />
    </FieldWrapper>
  )
}
