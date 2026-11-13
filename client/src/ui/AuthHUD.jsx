import { useBloxity } from '../bloxity/BloxityContext'
import StrokeText from './StrokeText'
import { GRADIENTS, u } from './hud/style'

/**
 * Your name tag, in the top-right corner: picture and name.
 *
 * No log in / out here: players arrive already signed in to their Bloxity account, and
 * anyone without one plays as a guest. `identity` is `getUser() || getGuest()`, so there
 * is always a name and picture to show.
 */
export function AuthHUD() {
  const { identity } = useBloxity()

  const name = identity?.displayName || identity?.username || 'Guest'
  const pfp = identity?.pfp

  return (
    <div
      className="pointer-events-none flex items-center"
      style={{
        height: u(64),
        padding: `0 ${u(18)} 0 ${u(6)}`,
        gap: u(10),
        borderRadius: u(32),
        background: 'linear-gradient(180deg, rgba(58, 68, 98, 0.94), rgba(26, 30, 46, 0.94))',
        border: `${u(4)} solid #111`,
        boxShadow: `0 ${u(6)} 0 #111, inset 0 ${u(3)} 0 rgba(255,255,255,0.18)`,
      }}
    >
      {pfp ? (
        <img
          src={pfp}
          alt=""
          className="rounded-full object-cover"
          style={{ width: u(46), height: u(46), border: `${u(3)} solid #fff`, background: '#2c344d' }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: u(46), height: u(46), border: `${u(3)} solid #fff`, background: GRADIENTS.blueButton, fontSize: u(26) }}
        >
          <StrokeText stroke={u(5)}>{name.charAt(0).toUpperCase()}</StrokeText>
        </div>
      )}
      <span className="max-w-[26vw] truncate" style={{ fontSize: u(28) }}>
        <StrokeText stroke={u(6)}>{name}</StrokeText>
      </span>
    </div>
  )
}

export default AuthHUD
