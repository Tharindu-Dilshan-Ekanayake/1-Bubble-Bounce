import { forwardRef, useEffect, useMemo } from 'react'
import { BufferAttribute, CircleGeometry, Color, CylinderGeometry, DoubleSide, Matrix4, MeshLambertMaterial, Quaternion, TorusGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { createBubbleMaterial } from './bubbles'
import { WAND, WAND_RING } from './playerPose'

/**
 * The bubble wand in your right hand: a candy-pink stick with a gold grip, a ring at its
 * end and a shimmering soap film across the ring, tinted as the bubble you've equipped.
 * Laid out in the hand's rest frame (arm hanging, facing +Z): the stick runs forward from
 * the fist, the ring's face looks along the stick's side, so with the arm raised to blow
 * the ring sits up in front of your mouth (playerPose WAND). Moved onto the palm every
 * frame by the avatar (`handRef`, avatarRig.placeHand); shown only while blowing.
 *
 * Two draw calls when shown (wand, film), none when hidden; the geometry and the wand's
 * material are shared by every wand in the game.
 */

let shared = null
function sharedWand() {
  if (shared) return shared
  const m = new Matrix4()
  const along = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
  const coloured = (geometry, hex) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    const c = new Color(hex)
    const colors = new Float32Array(g.getAttribute('position').count * 3)
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i)
    g.setAttribute('color', new BufferAttribute(colors, 3))
    return g
  }
  // The stick: along +Z from the fist (a cylinder's axis is Y; turned onto Z).
  const stick = coloured(new CylinderGeometry(0.022, 0.026, WAND.stick, 8).applyMatrix4(m.compose(new Vector3(0, 0, WAND.stick / 2 - 0.04), along, new Vector3(1, 1, 1))), '#ff5fa8')
  const grip = coloured(new CylinderGeometry(0.034, 0.034, 0.12, 8).applyMatrix4(m.compose(new Vector3(0, 0, 0), along, new Vector3(1, 1, 1))), '#ffd21f')
  // The ring: a torus's axis is Z; turned so its face looks along Y (towards your face, blowing).
  const ring = coloured(new TorusGeometry(WAND.ring, 0.022, 6, 20).applyMatrix4(m.compose(WAND_RING, along, new Vector3(1, 1, 1))), '#ff8fd0')
  const geometry = mergeGeometries([stick, grip, ring])
  for (const g of [stick, grip, ring]) g.dispose()
  const film = new CircleGeometry(WAND.ring - 0.01, 18).applyMatrix4(m.compose(WAND_RING, along, new Vector3(1, 1, 1)))
  shared = { geometry, film, material: new MeshLambertMaterial({ vertexColors: true }) }
  return shared
}

/**
 * A wand. The parent shows it (`visible`) and tints its film (`userData.setBubble(id)`);
 * its group is the `handRef` the avatar puts on the palm.
 */
export const Wand = forwardRef(function Wand(_props, ref) {
  const { geometry, film, material } = sharedWand()
  const filmMaterial = useMemo(() => {
    const mat = createBubbleMaterial({ id: 'soap' })
    mat.side = DoubleSide
    return mat
  }, [])
  useEffect(() => () => filmMaterial.dispose(), [filmMaterial])
  return (
    <group ref={ref} visible={false} userData={{ film: filmMaterial }}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
      <mesh geometry={film} material={filmMaterial} frustumCulled={false} renderOrder={2} />
    </group>
  )
})

export default Wand
