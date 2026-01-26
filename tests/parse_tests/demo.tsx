import React, { useEffect, useState } from 'react'

export interface Props {
  initialCount: number
}

export type Status = 'idle' | 'running'

export enum Mode {
  Light = 'light',
  Dark = 'dark'
}

export function Header({ title }: { title: string }) {
  return <h1>{title}</h1>
}

export default function DemoApp({ initialCount }: Props) {
  const [count, setCount] = useState(initialCount)

  useEffect(() => {
    document.title = `Count ${count}`
  }, [count])

  return (
    <div>
      <Header title={`Count: ${count}`} />
      <button onClick={() => setCount(count + 1)}>Add</button>
    </div>
  )
}
