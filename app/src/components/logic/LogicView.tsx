import { useEffect, useRef, useState } from 'react'
import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js'
import type { ProjectNode } from '../../types/project'
import { useTheme } from '../../theme/ThemeProvider'

// LogicView component
type LogicViewProps = {
  projectTree: ProjectNode | null
  selectedFilePath?: string | null
  onSelectFilePath?: (filePath: string) => void
}

// Main LogicView component
export default function LogicView({
  projectTree,
  selectedFilePath,
  onSelectFilePath,
}: LogicViewProps) {
  const { logicSettings, theme } = useTheme()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const rootRef = useRef<Container | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const lastRootPathRef = useRef<string | null>(null)
  const collapseInitRef = useRef(false)
  const userToggledRef = useRef(false)
  const lastSelectionRef = useRef<string | null>(null)
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

  // Initialize PixiJS application
  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!hostRef.current || appRef.current) return

      const app = new Application()
      await app.init({
        background: theme === 'light' ? '#f8fafc' : '#0f1115',
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      if (cancelled) {
        app.destroy(true, { children: true })
        return
      }

      const canvas = app.canvas
      const themeColor = theme === 'light' ? '#f8fafc' : '#0f1115'
      canvas.style.background = themeColor
      hostRef.current.appendChild(canvas)
      const { width, height } = hostRef.current.getBoundingClientRect()
      if (width > 0 && height > 0) {
        app.renderer.resize(width, height)
      }

      const root = new Container()
      root.position.set(40, 40)
      app.stage.addChild(root)
      app.stage.eventMode = 'static'
      app.stage.hitArea = app.renderer.screen

      rootRef.current = root
      appRef.current = app
      setIsReady(true)

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

      let resizeRaf = 0
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        if (resizeRaf) cancelAnimationFrame(resizeRaf)
        resizeRaf = requestAnimationFrame(() => {
          if (width > 0 && height > 0) {
            app.renderer.resize(width, height)
            app.renderer.background.color = theme === 'light' ? 0xf8fafc : 0x0f1115
            app.render()
          }
        })
      })
      resizeObserver.observe(hostRef.current)

      cleanupRef.current = () => {
        canvas.removeEventListener('wheel', onWheel)
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', onPointerUp)
        canvas.removeEventListener('pointerleave', onPointerUp)
        if (resizeRaf) cancelAnimationFrame(resizeRaf)
        resizeObserver.disconnect()
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

  // Update background color on theme change
  useEffect(() => {
    const app = appRef.current
    if (!app) return
    const color = theme === 'light' ? 0xf8fafc : 0x0f1115
    if (app.renderer?.background) {
      app.renderer.background.color = color
    }
    if (app.canvas) {
      app.canvas.style.background = theme === 'light' ? '#f8fafc' : '#0f1115'
    }
  }, [theme])

  // Handle project tree changes
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

  // Handle logic settings changes
  useEffect(() => {
    if (!userToggledRef.current) {
      collapseInitRef.current = false
    }
  }, [logicSettings])

  useEffect(() => {
    if (!selectedFilePath || !projectTree) return
    if (lastSelectionRef.current === selectedFilePath) return
    lastSelectionRef.current = selectedFilePath
    const dirPaths = new Set<string>()

    function findPath(node: ProjectNode, target: string): boolean {
      if (node.path === target) return true
      if (node.type !== 'dir' || !node.children) return false
      for (const child of node.children) {
        if (findPath(child, target)) {
          dirPaths.add(node.path)
          return true
        }
      }
      return false
    }

    if (findPath(projectTree, selectedFilePath)) {
      setCollapsedDirs((prev) => {
        let changed = false
        const next = new Set(prev)
        dirPaths.forEach((dirPath) => {
          if (next.delete(dirPath)) changed = true
        })
        return changed ? next : prev
      })
    }
  }, [selectedFilePath, projectTree])

  // Initialize collapsed dirs based on settings
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

  // Render logic view
  useEffect(() => {
    const root = rootRef.current
    if (!root || !isReady) return

    root.removeChildren().forEach((child) => child.destroy?.())

    const isLight = theme === 'light'
    const labelStyle = new TextStyle({
      fill: isLight ? '#0f172a' : '#e2e8f0',
      fontSize: 13,
      fontFamily: 'Arial',
    })
    const badgeStyle = new TextStyle({
      fill: isLight ? '#0f172a' : '#0b1220',
      fontSize: 10,
      fontFamily: 'Arial',
      fontWeight: '600',
    })

    const nodeStyle = {
      width: 210,
      height: 38,
      radius: 9,
      fillDir: isLight ? 0xf8fafc : 0x1b2736,
      fillFile: isLight ? 0xe2e8f0 : 0x141c28,
      strokeDir: isLight ? 0x94a3b8 : 0x3b526f,
      strokeFile: isLight ? 0x94a3b8 : 0x2b3a50,
      accentDir: isLight ? 0x38bdf8 : 0x7dd3fc,
      accentFile: isLight ? 0x8b5cf6 : 0xa78bfa,
      linkColor: isLight ? 0x94a3b8 : 0x8aa0c2,
    }

    // Truncate label if too long
    function truncateLabel(label: string, max = 28) {
      return label.length > max ? `${label.slice(0, max - 1)}…` : label
    }

    // Create a node graphic
    function createNode(
      label: string,
      isDir: boolean,
      isCollapsed: boolean,
      isSelected: boolean,
      filePath?: string,
      onToggle?: () => void
    ) {
      const container = new Container()
      const accent = isDir ? nodeStyle.accentDir : nodeStyle.accentFile
      const fill = isDir ? nodeStyle.fillDir : nodeStyle.fillFile
      const stroke = isSelected
        ? 0x2563eb
        : isDir
          ? nodeStyle.strokeDir
          : nodeStyle.strokeFile

      const box = new Graphics()
      box.roundRect(0, 0, nodeStyle.width, nodeStyle.height, nodeStyle.radius)
      box.fill(fill)
      box.stroke({ color: stroke, width: isSelected ? 2.25 : 1.25 })

      if (isSelected) {
        const glow = new Graphics()
        glow.roundRect(
          1,
          1,
          nodeStyle.width - 2,
          nodeStyle.height - 2,
          Math.max(1, nodeStyle.radius - 1)
        )
        glow.stroke({ color: 0x93c5fd, width: 1.5, alpha: 0.45 })
        container.addChild(glow)
      }

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

      if (!isDir && filePath) {
        container.eventMode = 'static'
        container.cursor = 'pointer'
        container.hitArea = new Rectangle(0, 0, nodeStyle.width, nodeStyle.height)
        if (onSelectFilePath) {
          container.on('pointertap', () => onSelectFilePath(filePath))
        }
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

    // Create node graphics and position them
    nodes.forEach((entry) => {
      const isDir = entry.node.type === 'dir'
      const isCollapsed = isDir && collapsedDirs.has(entry.node.path)
      const label = isDir ? `${entry.node.name}/` : entry.node.name
      const isSelected = !!selectedFilePath && entry.node.path === selectedFilePath
      const nodeGraphic = createNode(
        label,
        isDir,
        isCollapsed,
        isSelected,
        entry.node.path,
        () => {
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
      }
      )
      nodeGraphic.position.set(entry.x, entry.y)
      root.addChild(nodeGraphic)
    })

    // Create links between nodes
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

    links.stroke({ color: nodeStyle.linkColor, width: 2, alpha: 0.85 })
    root.addChildAt(links, 0)
  }, [projectTree, isReady, collapsedDirs, theme, selectedFilePath])

  return <div className="logic-canvas" ref={hostRef} />
}
