type MascotProps = {
  className?: string
  decorative?: boolean
}

export function Mascot({ className, decorative = false }: MascotProps) {
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL}mascot/cibao.png`}
      alt={decorative ? '' : '词宝，词星球的学习伙伴'}
      aria-hidden={decorative ? 'true' : undefined}
    />
  )
}
