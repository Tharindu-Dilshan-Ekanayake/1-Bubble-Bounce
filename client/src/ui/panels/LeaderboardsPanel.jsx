import { openBoxityLeaderboard } from '../../bloxity/services'
import { BOARD_INFO, boardRows } from '../../game/world/boards'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { u } from '../hud/style'
import Panel from './Panel'

/**
 * The four leaderboards, the same data as the boards in the lobby. Inside Boxity each
 * title also opens Boxity's own board for it (all players, all time).
 */
export function LeaderboardsPanel() {
  const leaderboards = useGame((s) => s.leaderboards)
  const profile = useGame((s) => s.profile)
  const online = useGame((s) => s.net.mode === 'online')

  return (
    <Panel title="LEADERBOARDS" width={1100}>
      {!online && (
        <p className="m-0 text-center" style={{ fontSize: u(26), marginBottom: u(10) }}>
          <StrokeText stroke={u(5)} fill="#ffd27a">
            Offline - connect to a server to compete with everyone.
          </StrokeText>
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4" style={{ gap: u(14) }}>
        {Object.entries(BOARD_INFO).map(([id, info]) => (
          <div key={id} style={{ borderRadius: u(8), border: `${u(5)} solid #111`, background: 'linear-gradient(180deg,#1d2a5c,#101634)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => openBoxityLeaderboard(id)}
              className="pp-btn pointer-events-auto block w-full text-center"
              style={{ background: info.color, padding: u(8), fontSize: u(36) }}
            >
              <StrokeText stroke={u(7)}>{info.title}</StrokeText>
            </button>
            <div style={{ padding: u(8) }}>
              {boardRows(leaderboards, profile, id)
                .slice(0, 10)
                .map((row, i) => (
                  <div
                    key={`${row.name}-${i}`}
                    className="flex items-center justify-between"
                    style={{ padding: `${u(5)} ${u(8)}`, background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.06)', fontSize: u(26), gap: u(8) }}
                  >
                    <span className="truncate">
                      <StrokeText stroke={u(5)} fill={i === 0 ? '#ffd21f' : '#ffffff'}>
                        #{i + 1} {row.name}
                      </StrokeText>
                    </span>
                    <StrokeText stroke={u(5)} fill={info.color}>
                      {info.format(row.value)}
                    </StrokeText>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export default LeaderboardsPanel
