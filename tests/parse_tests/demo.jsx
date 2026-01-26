import React, { useEffect, useState } from 'react'
import clsx from 'clsx'

export function Header({ title }) {
  return <h1 className="title">{title}</h1>
}

export default function DemoApp() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    document.title = `Count ${count}`
  }, [count])

  return (
    <div className={clsx('app', count > 0 && 'active')}>
      <Header title={`Count: ${count}`} />
      <button onClick={() => setCount(count + 1)}>Add</button>
    </div>
  )
}
