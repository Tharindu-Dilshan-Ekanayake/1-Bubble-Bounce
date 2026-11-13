import { useEffect, useState } from 'react'

import { isMuted, onMutedChange, setMuted } from '../../audio/sfx'
import { useQuality } from '../../store/quality'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

/** The three graphics levels, as players see them (LOW suits phones; HIGH strong computers). */
const GRAPHICS = [
  { level: 'LOW', label: 'Low', blurb: 'Fastest', gradient: GRADIENTS.greenButton },
  { level: 'MEDIUM', label: 'Medium', blurb: 'More effects', gradient: GRADIENTS.blueButton },
  { level: 'HIGH', label: 'High', blurb: 'Best looking', gradient: GRADIENTS.purpleButton },
]

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: u(40), marginBottom: u(10) }}>
      <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
        {children}
      </StrokeText>
    </div>
  )
}

/**
 * Settings: the graphics level (LOW by default; picking another rebuilds the 3D view
 * with it and remembers it on this device) and sound on or off.
 */
export function SettingsPanel() {
  const level = useQuality((s) => s.level)
  const setLevel = useQuality((s) => s.setLevel)
  const [muted, setMutedState] = useState(isMuted)
  useEffect(() => onMutedChange(setMutedState), [])

  return (
    <Panel title="SETTINGS" icon="settings" width={860}>
      <SectionTitle>Graphics</SectionTitle>
      <div className="grid grid-cols-3" style={{ gap: u(14) }}>
        {GRAPHICS.map((g) => {
          const selected = g.level === level
          return (
            <ChunkyButton
              key={g.level}
              gradient={selected ? g.gradient : GRADIENTS.greyButton}
              onClick={() => setLevel(g.level, true)}
              title={g.blurb}
              radius={16}
              border={5}
              className="flex-col"
              style={{ height: u(150), outline: selected ? `${u(6)} solid #ffffff` : 'none', padding: u(8) }}
            >
              <span style={{ fontSize: u(52) }}>
                <StrokeText stroke={u(10)}>{g.label}</StrokeText>
              </span>
              <span className="text-center" style={{ fontSize: u(26), lineHeight: 1.15 }}>
                <StrokeText stroke={u(5)}>{selected ? 'Selected' : g.blurb}</StrokeText>
              </span>
            </ChunkyButton>
          )
        })}
      </div>

      <div style={{ marginTop: u(28) }}>
        <SectionTitle>Sound</SectionTitle>
        <ChunkyButton
          gradient={muted ? GRADIENTS.greyButton : GRADIENTS.greenButton}
          onClick={() => setMuted(!muted)}
          radius={16}
          border={5}
          style={{ height: u(90), width: u(300) }}
        >
          <span style={{ fontSize: u(44) }}>
            <StrokeText stroke={u(9)}>{muted ? 'Sound: OFF' : 'Sound: ON'}</StrokeText>
          </span>
        </ChunkyButton>
      </div>
    </Panel>
  )
}

export default SettingsPanel
