import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  SRGBColorSpace,
} from 'three'

import { LEADERBOARDS } from '@shared/world'

import { useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { BlockSet, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { BOARD_INFO, boardRows } from './boards'

const BOARD_W = 9
const BOARD_H = 7
const BOARD_BOTTOM = 1.4
const FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'


function drawBoards(ctx, w, h, leaderboards, profile) {
  const colW = w / LEADERBOARDS.length
  ctx.clearRect(0, 0, w, h)
  LEADERBOARDS.forEach((board, i) => {
    const info = BOARD_INFO[board.id]
    const x0 = i * colW
    const pad = colW * 0.03
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#1d2a5c')
    grad.addColorStop(1, '#101634')
    ctx.fillStyle = grad
    ctx.fillRect(x0 + pad, pad, colW - pad * 2, h - pad * 2)

    // Title strip.
    const titleH = h * 0.15
    ctx.fillStyle = info.color
    ctx.fillRect(x0 + pad, pad, colW - pad * 2, titleH)
    ctx.font = `${titleH * 0.62}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = titleH * 0.12
    ctx.strokeStyle = '#111'
    ctx.strokeText(info.title, x0 + colW / 2, pad + titleH / 2)
    ctx.fillStyle = '#fff'
    ctx.fillText(info.title, x0 + colW / 2, pad + titleH / 2)

    const rows = boardRows(leaderboards, profile, board.id).slice(0, 10)
    const rowH = (h - titleH - pad * 3) / 10
    rows.forEach((row, r) => {
      const y = pad * 2 + titleH + r * rowH
      if (r % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)'
        ctx.fillRect(x0 + pad, y, colW - pad * 2, rowH)
      }
      const cy = y + rowH / 2
      ctx.font = `${rowH * 0.62}px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillStyle = r === 0 ? '#ffd21f' : r === 1 ? '#d9e2ec' : r === 2 ? '#e8a066' : '#9fb2d9'
      ctx.fillText(`#${r + 1}`, x0 + pad * 2.5, cy)
      ctx.fillStyle = '#ffffff'
      const name = row.name.length > 14 ? `${row.name.slice(0, 13)}…` : row.name
      ctx.fillText(name, x0 + colW * 0.2, cy)
      ctx.textAlign = 'right'
      ctx.fillStyle = info.color
      ctx.fillText(info.format(row.value), x0 + colW - pad * 2.5, cy)
    })
  })
}

/**
 * The four leaderboards behind the egg plaza. Frames are blocks; all four faces are
 * one quad mesh on one canvas texture, redrawn when the boards update (once a minute).
 */
export function Leaderboards() {
  const leaderboards = useGame((s) => s.leaderboards)
  const profile = useGame((s) => s.profile)
  const playable = useGame((s) => s.playable)

  const assets = useMemo(() => {
    const { maxTexture } = useQuality.getState().settings
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(1024, maxTexture)
    canvas.height = Math.round(canvas.width * (BOARD_H / (BOARD_W * LEADERBOARDS.length)))
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearMipmapLinearFilter
    texture.magFilter = LinearFilter

    // One quad per board, each mapped to its third of the texture. Faces -Z (the plaza).
    const positions = []
    const uvs = []
    const index = []
    LEADERBOARDS.forEach((b, i) => {
      const x0 = b.x + BOARD_W / 2
      const x1 = b.x - BOARD_W / 2
      const z = b.z - 0.55
      const y0 = BOARD_BOTTOM
      const y1 = BOARD_BOTTOM + BOARD_H
      const u0 = i / LEADERBOARDS.length
      const u1 = (i + 1) / LEADERBOARDS.length
      const base = i * 4
      positions.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z)
      uvs.push(u0, 0, u1, 0, u1, 1, u0, 1)
      index.push(base, base + 1, base + 2, base, base + 2, base + 3)
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
    geometry.setIndex(index)
    const material = new MeshBasicMaterial({ map: texture })

    const frames = new BlockSet()
    for (const b of LEADERBOARDS) {
      frames.addOn(b.x, 0, b.z, BOARD_W + 0.8, BOARD_BOTTOM + BOARD_H + 0.6, 0.9, '#2f3f8a')
      frames.addOn(b.x, BOARD_BOTTOM + BOARD_H + 0.6, b.z, BOARD_W + 1.2, 0.6, 1.1, '#ffd21f', STYLE.GLOW)
    }
    return { canvas, texture, geometry, material, frames: frames.build(sharedMaterials().blocks) }
  }, [])

  useEffect(
    () => () => {
      assets.texture.dispose()
      assets.geometry.dispose()
      assets.material.dispose()
      disposeBlocks(assets.frames)
    },
    [assets],
  )

  useEffect(() => {
    // Not needed to start playing: drawn once the game is on screen.
    if (!playable) return undefined
    let cancelled = false
    document.fonts?.load(`32px ${FONT}`).finally(() => {
      if (cancelled) return
      drawBoards(assets.canvas.getContext('2d'), assets.canvas.width, assets.canvas.height, leaderboards, profile)
      assets.texture.needsUpdate = true
    })
    return () => {
      cancelled = true
    }
    // Profile changes constantly while training; offline boards only need the name
    // and headline stats, which a rebirth or a new best will bring along.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, playable, leaderboards, profile.rebirths, profile.name])

  return (
    <>
      <primitive object={assets.frames} />
      <mesh geometry={assets.geometry} material={assets.material} />
    </>
  )
}

export default Leaderboards
