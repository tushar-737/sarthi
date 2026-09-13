/**
 * Design-system primitives.
 *
 * Every control here is keyboard-reachable, has a visible focus ring, and is
 * sized for a thumb. Colour is never the only signal: status badges pair an
 * icon with a word, and checkboxes pair a tick with a label.
 */

import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase,
  CheckCircle2,
  CreditCard,
  FileText,
  GraduationCap,
  HandHeart,
  HeartPulse,
  Home,
  Info,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { useSettings } from '../context/SettingsContext'
import type { VerificationLevel } from '../lib/types'

/* --- Buttons ------------------------------------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-trust-700 text-white hover:bg-trust-800 active:bg-trust-900 shadow-card disabled:bg-line-strong disabled:text-ink-mute',
  secondary:
    'bg-white text-navy-800 border-2 border-line-strong hover:border-trust-600 hover:text-trust-700 active:bg-trust-50',
  ghost: 'bg-transparent text-navy-700 hover:bg-navy-50 active:bg-navy-100',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
  success: 'bg-success-600 text-white hover:bg-success-700',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'min-h-10 px-3 py-2 text-sm gap-1.5 rounded-lg',
  md: 'min-h-12 px-4 py-2.5 text-base gap-2 rounded-xl',
  lg: 'min-h-14 px-6 py-3 text-lg gap-2.5 rounded-xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: LucideIcon
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors duration-150',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600',
        'disabled:cursor-not-allowed disabled:opacity-70',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon className={size === 'sm' ? 'size-4' : 'size-5'} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  )
}

export interface LinkButtonProps {
  to: string
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  fullWidth?: boolean
  className?: string
  children: ReactNode
  external?: boolean
}

/** Same visual language as `Button`, but for navigation and external portals. */
export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  fullWidth = false,
  className,
  children,
  external = false,
}: LinkButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center font-semibold transition-colors duration-150',
    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && 'w-full',
    className,
  )

  if (external) {
    return (
      <a
        href={to}
        className={classes}
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {Icon ? <Icon className={size === 'sm' ? 'size-4' : 'size-5'} aria-hidden="true" /> : null}
        {children}
      </a>
    )
  }

  return (
    <Link to={to} className={classes}>
      {Icon ? <Icon className={size === 'sm' ? 'size-4' : 'size-5'} aria-hidden="true" /> : null}
      {children}
    </Link>
  )
}

/* --- Surfaces ------------------------------------------------------------ */

export function Card({
  children,
  className,
  as: Tag = 'div',
  padded = true,
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article' | 'li' | 'aside'
  padded?: boolean
}) {
  return (
    <Tag
      className={cn(
        'rounded-card bg-white shadow-card border border-line',
        padded && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function SectionHeading({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon ? (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-trust-50 text-trust-700">
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-navy-800 leading-snug">{title}</h2>
          {hint ? <p className="text-sm text-ink-mute mt-0.5">{hint}</p> : null}
        </div>
      </div>
      {action}
    </div>
  )
}

/* --- Verification badge -------------------------------------------------- */

const VERIFICATION_STYLES: Record<
  VerificationLevel,
  { wrapper: string; icon: LucideIcon; label: string }
> = {
  verified_official: {
    wrapper: 'bg-success-50 text-success-700 border-success-100',
    icon: ShieldCheck,
    label: 'verification.verified_official',
  },
  general_guidance: {
    wrapper: 'bg-attention-50 text-attention-700 border-attention-100',
    icon: Info,
    label: 'verification.general_guidance',
  },
  confirm_with_authority: {
    wrapper: 'bg-danger-50 text-danger-700 border-danger-100',
    icon: ShieldAlert,
    label: 'verification.confirm_with_authority',
  },
}

export function VerificationBadge({
  level,
  label,
  size = 'md',
  className,
}: {
  level: VerificationLevel
  /** Localised label from the backend; falls back to the built-in copy. */
  label?: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const { t } = useSettings()
  const style = VERIFICATION_STYLES[level] ?? VERIFICATION_STYLES.general_guidance
  const Icon = style.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border font-semibold',
        style.wrapper,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden="true" />
      {label || t(style.label)}
    </span>
  )
}

/* --- Toggle -------------------------------------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  onLabel,
  offLabel,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
  onLabel: string
  offLabel: string
  disabled?: boolean
}) {
  // useId, not a slug of the label: Devanagari labels would all collapse to
  // the same dashes and point aria-labelledby at the wrong control.
  const labelId = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-navy-800" id={labelId}>
          {label}
        </p>
        {hint ? <p className="mt-0.5 text-sm text-ink-mute">{hint}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {/* The state is written out in words, never carried by colour alone. */}
        <span
          className={cn(
            'min-w-9 text-right text-xs font-bold uppercase tracking-wide',
            checked ? 'text-success-700' : 'text-ink-mute',
          )}
          aria-hidden="true"
        >
          {checked ? onLabel : offLabel}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={labelId}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            'relative inline-flex h-8 w-14 shrink-0 items-center rounded-pill transition-colors duration-150',
            'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600',
            'disabled:cursor-not-allowed disabled:opacity-50',
            checked ? 'bg-success-600' : 'bg-line-strong',
          )}
        >
          <span
            className={cn(
              'inline-block size-6 rounded-full bg-white shadow-lift transition-transform duration-150',
              checked ? 'translate-x-7' : 'translate-x-1',
            )}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  )
}

/* --- Category icon ------------------------------------------------------- */

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'file-text': FileText,
  'id-card': CreditCard,
  'graduation-cap': GraduationCap,
  briefcase: Briefcase,
  'heart-pulse': HeartPulse,
  'hand-heart': HandHeart,
  home: Home,
}

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? FileText
  return <Icon className={cn('size-5', className)} aria-hidden="true" />
}

/* --- Feedback ------------------------------------------------------------ */

export function InlineNote({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  title?: string
  children: ReactNode
  className?: string
}) {
  const tones = {
    info: 'bg-trust-50 border-trust-100 text-navy-800',
    warning: 'bg-attention-50 border-attention-100 text-attention-700',
    danger: 'bg-danger-50 border-danger-100 text-danger-700',
    success: 'bg-success-50 border-success-100 text-success-700',
  } as const
  const icons = {
    info: Info,
    warning: TriangleAlert,
    danger: ShieldAlert,
    success: CheckCircle2,
  } as const
  const Icon = icons[tone]
  return (
    <div className={cn('flex gap-3 rounded-xl border-2 p-3.5', tones[tone], className)}>
      <Icon className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 text-sm leading-relaxed">
        {title ? <p className="font-bold mb-0.5">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  )
}

