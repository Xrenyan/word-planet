import { useState, type ReactNode } from 'react'
import { Pressable, type PressableProps } from './Pressable'

type AsyncButtonProps = Omit<PressableProps, 'onClick'> & {
  children: ReactNode
  pendingLabel: string
  onPress: () => Promise<void>
}

export function AsyncButton({ children, pendingLabel, onPress, disabled, ...props }: AsyncButtonProps) {
  const [pending, setPending] = useState(false)

  async function handleClick() {
    if (pending) return
    setPending(true)
    try {
      await onPress()
    } finally {
      setPending(false)
    }
  }

  return (
    <Pressable
      {...props}
      type="button"
      disabled={disabled || pending}
      aria-busy={pending ? 'true' : undefined}
      onClick={handleClick}
    >
      {pending ? pendingLabel : children}
    </Pressable>
  )
}
