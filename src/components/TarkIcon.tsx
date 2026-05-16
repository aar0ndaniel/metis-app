import type { CSSProperties } from 'react'

interface TarkIconProps {
  size?: number
  alt?: string
  className?: string
  style?: CSSProperties
}

export default function TarkIcon({ size = 18, alt = '', className, style }: TarkIconProps) {
  return (
    <span
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={className}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        borderRadius: Math.max(5, Math.round(size * 0.28)),
        background: 'rgb(var(--color-accent-rgb) / 0.12)',
        color: 'var(--color-accent)',
        fontFamily: 'Matter, "DM Sans", sans-serif',
        fontSize: Math.max(10, Math.round(size * 0.56)),
        fontWeight: 700,
        lineHeight: 1,
        ...style,
      }}
    >
      T
    </span>
  )
}
