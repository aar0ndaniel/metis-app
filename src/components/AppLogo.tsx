import React from 'react'
import logoBlack from '../assets/logo-black.svg'
import logoPrimary from '../assets/logo-primary.svg'
import logoWhite from '../assets/logo-white.svg'

interface AppLogoProps {
  size?: number | string
  color?: string
  variant?: 'primary' | 'white' | 'black'
  className?: string
  style?: React.CSSProperties
}

const AppLogo: React.FC<AppLogoProps> = ({ 
  size = 24, 
  color = '#87976B',
  variant,
  className, 
  style 
}) => {
  const normalizedColor = String(color).toLowerCase()
  const logoSrc = variant === 'black'
    ? logoBlack
    : variant === 'primary'
      ? logoPrimary
      : variant === 'white'
        ? logoWhite
        : normalizedColor === '#181818' || normalizedColor === 'black'
          ? logoBlack
          : logoPrimary

  return (
    <img
      src={logoSrc}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, objectFit: 'contain', ...style }}
      aria-hidden="true"
    />
  )
}

export default AppLogo
