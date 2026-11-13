import { Vector3 } from 'three'

import { bubbleFor, localBubble } from '../../bloxity/chat'
import { runtime } from '../runtime'

/**
 * Name tags over other players: a fixed pool of DOM elements (one per possible
 * remote player) positioned from the frame loop, like the power popups.
 *
 * Each tag also carries a chat bubble line above the name, filled from Boxity chat
 * (bloxity/chat.js) while that player's latest message is fresh. Your own messages get
 * a lone bubble over your character (`placeLocalBubble`), placed by the follow camera.
 */

export const NAMEPLATE_POOL_SIZE = 8

/** Your bubble floats this far above your feet (players are 1.8 tall, tags sit at 2.05). */
const LOCAL_BUBBLE_HEIGHT = 2.2

const pool = []
/** Your own bubble: { el, text, shown }. */
const local = { el: null, text: '', shown: false }
const _at = new Vector3()

/**
 * Each tag is a container holding an outline copy and a fill copy of the name
 * (`[data-name]`) and a chat bubble (`[data-bubble]`); `localBubbleEl` is the bubble
 * shown over your own character.
 */
export function registerNameplateElements(elements, localBubbleEl = null) {
  pool.length = 0
  for (const el of elements) {
    if (!el) continue
    pool.push({
      el,
      copies: [...el.querySelectorAll('[data-name]')],
      bubble: el.querySelector('[data-bubble]'),
      text: '',
      bubbleText: '',
      shown: false,
    })
  }
  local.el = localBubbleEl
  local.text = ''
  local.shown = false
}

/** Shows `text` in a bubble element (null hides it); touches the DOM only on change. */
function setBubble(holder, el, text) {
  if (!el) return
  const next = text || ''
  if (holder.bubbleText === next) return
  holder.bubbleText = next
  el.textContent = next
  el.style.display = next ? 'block' : 'none'
}

/**
 * Shows slot `i` at screen (x, y) with `text`; null x hides it. `uid` is the player's
 * Boxity id (their synced `uid`, '' for guests): it picks their chat bubble, falling
 * back to matching by name.
 */
export function placeNameplate(i, text, x, y, alpha = 1, uid = '') {
  const slot = pool[i]
  if (!slot) return
  if (x === null) {
    if (slot.shown) {
      slot.el.style.display = 'none'
      slot.shown = false
    }
    return
  }
  if (slot.text !== text) {
    slot.text = text
    for (const copy of slot.copies) copy.textContent = text
  }
  setBubble(slot, slot.bubble, bubbleFor(uid, text))
  if (!slot.shown) {
    slot.el.style.display = 'block'
    slot.shown = true
  }
  slot.el.style.opacity = String(alpha)
  slot.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
}

export function hideNameplatesFrom(start) {
  for (let i = start; i < pool.length; i += 1) placeNameplate(i, '', null)
}

function hideLocal() {
  if (!local.shown) return
  local.el.style.display = 'none'
  local.shown = false
}

/**
 * Places your own chat bubble over your character, or hides it when there is none.
 * Call once per frame after the camera has moved; costs one string compare when idle.
 */
export function placeLocalBubble(camera, width, height) {
  if (!local.el) return
  const text = localBubble()
  if (!text) {
    hideLocal()
    return
  }
  const p = runtime.player.position
  _at.set(p.x, p.y + LOCAL_BUBBLE_HEIGHT, p.z).project(camera)
  if (_at.z > 1 || Math.abs(_at.x) > 1.2 || Math.abs(_at.y) > 1.2) {
    hideLocal()
    return
  }
  if (local.text !== text) {
    local.text = text
    local.el.textContent = text
  }
  if (!local.shown) {
    local.el.style.display = 'block'
    local.shown = true
  }
  local.el.style.transform = `translate(${(_at.x * 0.5 + 0.5) * width}px, ${(-_at.y * 0.5 + 0.5) * height}px) translate(-50%, -100%)`
}
