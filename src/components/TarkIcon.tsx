import type { CSSProperties } from 'react'
import tarkIconUrl from '../../tark icon.png'

interface TarkIconProps {
  size?: number
  alt?: string
  className?: string
  style?: CSSProperties
}

export default function TarkIcon({ size = 18, alt = '', className, style }: TarkIconProps) {
  return (
    <img
      src={tarkIconUrl}
      alt={alt}
      className={className}
      draggable={false}
      style={{
        width: size,
        height: size,
        display: 'block',
        objectFit: 'contain',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
