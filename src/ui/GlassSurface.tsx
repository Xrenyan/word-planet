import type { ElementType, HTMLAttributes, ReactNode } from 'react'

type GlassSurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType
  children: ReactNode
  strength?: 'soft' | 'regular' | 'strong'
}

export function GlassSurface({ as: Component = 'div', children, className = '', strength = 'regular', ...props }: GlassSurfaceProps) {
  return (
    <Component {...props} className={`glass-surface glass-surface--${strength} ${className}`.trim()}>
      {children}
    </Component>
  )
}
