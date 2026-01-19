import { useEffect, useRef, useState } from 'react'
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { ProjectNode } from '../../types/project'
import { useTheme } from '../../theme/ThemeProvider'

type LogicViewProps = {
  projectTree: ProjectNode | null
}

export default function LogicView({ projectTree }: LogicViewProps) {
  const { logicSettings } = useTheme()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const rootRef = useRef<Container | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const lastRootPathRef = useRef<string | null>(null)
  const collapseInitRef = useRef(false)
  const userToggledRef = useRef(false)
  const [isReady, setIsReady] = useState(false)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(() => new Set())
  const interactionRef = useRef({
    dragging: false,
    lastX: 0,
    lastY: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  })

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!hostRef.current || appRef.current) return

      const app = new Application()
      await app.init({
        background: '#0f1115',
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        resizeTo: hostRef.current,
      })

      if (cancelled) {
        app.destroy(true, { children: true })
        return
      }

      hostRef.current.appendChild(app.canvas)
      const root = new Container()
      root.position.set(40, 40)
      app.stage.addChild(root)

      rootRef.current = root
      appRef.current = app
      setIsReady(true)

      const canvas = app.canvas
      const onWheel = (event: WheelEvent) => {
        event.preventDefault()
        const state = interactionRef.current
        const delta = Math.sign(event.deltaY) * -0.1
        const nextScale = Math.min(2, Math.max(0.4, state.scale + delta))
        state.scale = nextScale
        root.scale.set(nextScale)
      }

      const onPointerDown = (event: PointerEvent) => {
        interactionRef.current.dragging = true
        interactionRef.current.lastX = event.clientX
        interactionRef.current.lastY = event.clientY
        canvas.setPointerCapture(event.pointerId)
      }

      const onPointerMove = (event: PointerEvent) => {
        const state = interactionRef.current
        if (!state.dragging) return
        const dx = event.clientX - state.lastX
        const dy = event.clientY - state.lastY
        state.lastX = event.clientX
        state.lastY = event.clientY
        state.offsetX += dx
        state.offsetY += dy
        root.position.set(40 + state.offsetX, 40 + state.offsetY)
      }

      const onPointerUp = (event: PointerEvent) => {
        interactionRef.current.dragging = false
        canvas.releasePointerCapture(event.pointerId)
      }

      canvas.addEventListener('wheel', onWheel, { passive: false })
      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('pointerleave', onPointerUp)

      cleanupRef.current = () => {
        canvas.removeEventListener('wheel', onWheel)
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', onPointerUp)
        canvas.removeEventListener('pointerleave', onPointerUp)
      }
    }

    start()

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
      }
      rootRef.current = null
      setIsReady(false)
    }
  }, [])

  useEffect(() => {
    const nextRoot = projectTree?.path ?? null
    if (nextRoot && nextRoot !== lastRootPathRef.current) {
      lastRootPathRef.current = nextRoot
      setCollapsedDirs(new Set())
      collapseInitRef.current = false
      userToggledRef.current = false
    }
    if (nextRoot && !userToggledRef.current) {
      collapseInitRef.current = false
    }
  }, [projectTree])

  useEffect(() => {
    if (!userToggledRef.current) {
      collapseInitRef.current = false
    }
  }, [logicSettings])

  useEffect(() => {
    if (!projectTree || collapseInitRef.current || userToggledRef.current) return
    const MAX_CHILDREN = logicSettings.maxChildren
    const MAX_DEPTH = logicSettings.maxDepth
    const nextCollapsed = new Set<string>()

    function walk(node: ProjectNode, level: number) {
      if (node.type === 'dir') {
        if ((node.children?.length ?? 0) > MAX_CHILDREN || level >= MAX_DEPTH) {
          nextCollapsed.add(node.path)
        }
        node.children?.forEach((child) => walk(child, level + 1))
      }
    }

    walk(projectTree, 0)
    setCollapsedDirs(nextCollapsed)
    collapseInitRef.current = true
  }, [projectTree, logicSettings])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !isReady) return

    root.removeChildren().forEach((child) => child.destroy?.())

    const labelStyle = new TextStyle({
      fill: '#e2e8f0',
      fontSize: 13,
      fontFamily: 'Arial',
    })
    const badgeStyle = new TextStyle({
      fill: '#0b1220',
      fontSize: 10,
      fontFamily: 'Arial',
      fontWeight: '600',
    })

    const nodeStyle = {
      width: 210,
      height: 38,
      radius: 9,
      fillDir: 0x1b2736,
      fillFile: 0x141c28,
      strokeDir: 0x3b526f,
      strokeFile: 0x2b3a50,
      accentDir: 0x7dd3fc,
      accentFile: 0xa78bfa,
    }

    function truncateLabel(label: string, max = 28) {
      return label.length > max ? `${label.slice(0, max - 1)}…` : label
    }

    function createNode(
      label: string,
      isDir: boolean,
      isCollapsed: boolean,
      onToggle?: () => void
    ) {
      const container = new Container()
      const accent = isDir ? nodeStyle.accentDir : nodeStyle.accentFile
      const fill = isDir ? nodeStyle.fillDir : nodeStyle.fillFile
      const stroke = isDir ? nodeStyle.strokeDir : nodeStyle.strokeFile

      const box = new Graphics()
      box.roundRect(0, 0, nodeStyle.width, nodeStyle.height, nodeStyle.radius)
      box.fill(fill)
      box.stroke({ color: stroke, width: 1.25 })

      const innerStroke = new Graphics()
      innerStroke.roundRect(
        1,
        1,
        nodeStyle.width - 2,
        nodeStyle.height - 2,
        Math.max(1, nodeStyle.radius - 1)
      )
      innerStroke.stroke({ color: 0xffffff, width: 1, alpha: 0.08 })

      const accentBar = new Graphics()
      accentBar.roundRect(0, 0, 5, nodeStyle.height, nodeStyle.radius)
      accentBar.fill(accent)

      const badge = new Graphics()
      badge.roundRect(10, 9, 34, 16, 8)
      badge.fill(accent)

      const badgeText = new Text({
        text: isDir ? 'DIR' : 'FILE',
        style: badgeStyle,
      })
      badgeText.x = 16
      badgeText.y = Math.round((nodeStyle.height - badgeText.height) / 2)

      let toggleGlyph: Graphics | null = null
      if (isDir) {
        toggleGlyph = new Graphics()
        const glyphX = nodeStyle.width - 22
        const glyphY = nodeStyle.height / 2
        const glyphColor = isCollapsed ? 0x94a3b8 : 0xcbd5f5
        if (isCollapsed) {
          toggleGlyph
            .moveTo(glyphX - 3, glyphY - 4)
            .lineTo(glyphX + 4, glyphY)
            .lineTo(glyphX - 3, glyphY + 4)
            .closePath()
        } else {
          toggleGlyph
            .moveTo(glyphX - 4, glyphY - 3)
            .lineTo(glyphX, glyphY + 4)
            .lineTo(glyphX + 4, glyphY - 3)
            .closePath()
        }
        toggleGlyph.fill({ color: glyphColor, alpha: 0.95 })
      }

      const text = new Text({
        text: truncateLabel(label),
        style: labelStyle,
      })
      text.x = 52
      text.y = Math.round((nodeStyle.height - text.height) / 2)

      if (isDir && onToggle) {
        container.eventMode = 'static'
        container.cursor = 'pointer'
        container.on('pointertap', onToggle)
      }

      container.addChild(box, innerStroke, accentBar, badge, badgeText, text)
      if (toggleGlyph) container.addChild(toggleGlyph)
      return container
    }

    if (!projectTree) {
      const emptyText = new Text({
        text: 'Open a project to visualize its structure.',
        style: new TextStyle({
          fill: '#9ca3af',
          fontSize: 14,
          fontFamily: 'Arial',
        }),
      })
      emptyText.position.set(40, 40)
      root.addChild(emptyText)
      return
    }

    const nodes: {
      node: ProjectNode
      level: number
      x: number
      y: number
      parentIndex: number | null
    }[] = []

    const marginX = 32
    const marginY = 24
    const levelGap = 130
    const rowGap = 52
    let row = 0

    function walk(node: ProjectNode, level: number, parentIndex: number | null) {
      const x = marginX + level * levelGap
      const y = marginY + row * rowGap
      const currentIndex = nodes.length
      nodes.push({ node, level, x, y, parentIndex })
      row += 1
      const isCollapsed = node.type === 'dir' && collapsedDirs.has(node.path)
      if (!isCollapsed && node.children) {
        node.children.forEach((child) => walk(child, level + 1, currentIndex))
      }
    }

    walk(projectTree, 0, null)

    const links = new Graphics()

    nodes.forEach((entry) => {
      const isDir = entry.node.type === 'dir'
      const isCollapsed = isDir && collapsedDirs.has(entry.node.path)
      const label = isDir ? `${entry.node.name}/` : entry.node.name
      const nodeGraphic = createNode(label, isDir, isCollapsed, () => {
        if (!isDir) return
        userToggledRef.current = true
        setCollapsedDirs((prev) => {
          const next = new Set(prev)
          if (next.has(entry.node.path)) {
            next.delete(entry.node.path)
          } else {
            next.add(entry.node.path)
          }
          return next
        })
      })
      nodeGraphic.position.set(entry.x, entry.y)
      root.addChild(nodeGraphic)
    })

    nodes.forEach((entry) => {
      if (entry.parentIndex === null) return
      const parent = nodes[entry.parentIndex]
      const startX = parent.x + 24
      const startY = parent.y + nodeStyle.height
      const endX = entry.x - 15
      const endY = entry.y + nodeStyle.height / 2
      const midX = startX
      const midY = endY

      links.moveTo(startX, startY)
      links.lineTo(midX, midY)
      links.lineTo(endX, endY)
    })

    links.stroke({ color: 0x8aa0c2, width: 2, alpha: 0.85 })
    root.addChildAt(links, 0)
  }, [projectTree, isReady, collapsedDirs])

  return <div className="logic-canvas" ref={hostRef} />
}
