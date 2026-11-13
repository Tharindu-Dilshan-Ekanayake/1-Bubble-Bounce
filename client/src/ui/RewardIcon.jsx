import Icon from './Icon'
import PetIcon from './PetIcon'

/**
 * Icon for a reward table entry: `pet:<id>` draws the pet's portrait, anything else is
 * a regular icon name (including `egg:<id>`).
 */
export function RewardIcon({ icon, size }) {
  if (icon.startsWith('pet:')) return <PetIcon id={icon.slice(4)} size={size} />
  return <Icon name={icon} size={size} />
}

export default RewardIcon
