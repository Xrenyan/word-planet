import { useState, type ButtonHTMLAttributes, type PointerEvent } from 'react'

export type PressableProps = ButtonHTMLAttributes<HTMLButtonElement>

export function Pressable({
  children,
  className = '',
  type = 'button',
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...props
}: PressableProps) {
  const [pressed, setPressed] = useState(false)

  function beginPress(event: PointerEvent<HTMLButtonElement>) {
    setPressed(true)
    onPointerDown?.(event)
  }

  function endPress(event: PointerEvent<HTMLButtonElement>) {
    setPressed(false)
  }

  return (
    <button
      {...props}
      type={type}
      className={`pressable ${className}`.trim()}
      data-pressed={pressed ? 'true' : undefined}
      onPointerDown={beginPress}
      onPointerUp={(event) => { endPress(event); onPointerUp?.(event) }}
      onPointerCancel={(event) => { endPress(event); onPointerCancel?.(event) }}
      onPointerLeave={(event) => { endPress(event); onPointerLeave?.(event) }}
    >
      {children}
    </button>
  )
}
