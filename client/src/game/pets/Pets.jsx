import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Matrix4, Quaternion, Vector3 } from 'three'

import { FREE_REWARD, SPHINX_STAND } from '@shared/world'

import { getGame, useGame } from '../../store/game'
import { sphinxLabelSpec } from '../labels/lobbyLabels'
import { updateWorldLabel } from '../labels/registry'
import { asToyInstance, createToyInstances } from '../blocks'
import { sharedMaterials } from '../materials'
import { runtime } from '../runtime'
import { attachIconRenderer, processIconQueue } from './petIcons'
import { petGeometry } from './petModels'

/** Instances per species: your three plus seven other players' worth. */
const PER_SPECIES = 24
const PET_SCALE = 0.95
/** Formation slots behind the owner, in owner space (x right, z forward). */
const SLOTS = [
  [-1.5, -1.3],
  [1.5, -1.3],
  [0, -2.5],
]

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3(PET_SCALE, PET_SCALE, PET_SCALE)
const _up = new Vector3(0, 1, 0)
const _target = new Vector3()
const _before = new Vector3()

/**
 * Your pets' follow state, one per formation slot. Module-level: there is only ever one
 * local player, and frame code mutates these freely.
 */
const followers = SLOTS.map(() => ({ position: new Vector3(), yaw: 0, size: 0.85, visible: false, placed: false }))

/**
 * One InstancedMesh per species, made the first time anyone in the lobby has that pet
 * rather than all 22 at start-up. Module-level: there is one pet renderer.
 */
const speciesMeshes = new Map()
/** Species the frame loop wanted but that don't have a mesh yet. */
const wantedSpecies = new Set()

/**
 * Every pet in the lobby - yours and everyone else's - drawn as one InstancedMesh per
 * species, so ten players with three pets each is still only a handful of draw calls.
 *
 * Your pets trail you in formation, hopping as they go. Remote players' pets are
 * placed by the multiplayer layer through `runtime.remotePets`.
 */
export function Pets() {
  const gl = useThree((s) => s.gl)
  const groupRef = useRef(null)

  // Builds meshes for newly seen species between frames, never inside one.
  useEffect(() => {
    const group = groupRef.current
    const id = setInterval(() => {
      if (!group || wantedSpecies.size === 0) return
      for (const speciesId of wantedSpecies) {
        const mesh = createToyInstances(petGeometry(speciesId), sharedMaterials().toy, PER_SPECIES)
        mesh.castShadow = true
        speciesMeshes.set(speciesId, mesh)
        group.add(mesh)
      }
      wantedSpecies.clear()
    }, 50)
    return () => {
      clearInterval(id)
      for (const mesh of speciesMeshes.values()) {
        group?.remove(mesh)
        mesh.dispose()
      }
      speciesMeshes.clear()
      wantedSpecies.clear()
    }
  }, [])

  useEffect(() => {
    for (const f of followers) runtime.shadowCasters.add(f)
    return () => {
      for (const f of followers) runtime.shadowCasters.delete(f)
    }
  }, [])

  useEffect(() => {
    attachIconRenderer(gl)
  }, [gl])

  useFrame((state, rawDelta) => {
    processIconQueue()
    const group = groupRef.current
    if (!group) return
    const delta = Math.min(rawDelta, 0.05)
    const t = state.clock.elapsedTime

    for (const mesh of speciesMeshes.values()) mesh.count = 0

    const place = (id, position, yaw, hop) => {
      const mesh = speciesMeshes.get(id)
      if (!mesh) {
        wantedSpecies.add(id)
        return
      }
      if (mesh.count >= PER_SPECIES) return
      _p.copy(position)
      _p.y += hop
      _q.setFromAxisAngle(_up, yaw)
      mesh.setMatrixAt(mesh.count, _m.compose(_p, _q, _s))
      mesh.count += 1
    }

    // --- Your pets ----------------------------------------------------------------
    const { profile } = getGame()
    const player = runtime.player
    const sin = Math.sin(player.yaw)
    const cos = Math.cos(player.yaw)
    let slot = 0
    for (const uid of profile.equippedPets) {
      if (slot >= followers.length) break
      let pet = null
      for (const p of profile.pets) {
        if (p.uid === uid) {
          pet = p
          break
        }
      }
      if (!pet) continue
      const f = followers[slot]
      const [sx, sz] = SLOTS[slot]
      // Owner space -> world: right = (-cos, sin), forward = (sin, cos).
      _target.set(player.position.x - cos * sx + sin * sz, player.position.y, player.position.z + sin * sx + cos * sz)
      if (!f.placed) {
        f.position.copy(_target)
        f.placed = true
      }
      _before.copy(f.position)
      f.position.lerp(_target, 1 - Math.exp(-6 * delta))
      const moved = _before.distanceTo(f.position)
      if (moved > 0.005) f.yaw = Math.atan2(f.position.x - _before.x, f.position.z - _before.z)
      f.visible = true
      const hop = Math.abs(Math.sin(t * 7 + slot * 1.3)) * (moved > 0.01 ? 0.35 : 0.08)
      place(pet.id, f.position, f.yaw, hop)
      slot += 1
    }
    for (let i = slot; i < followers.length; i += 1) {
      followers[i].visible = false
      followers[i].placed = false
    }

    // --- Other players' pets ------------------------------------------------------
    for (const remote of runtime.remotePets) place(remote.id, remote.position, remote.yaw, remote.hop || 0)

    for (const mesh of speciesMeshes.values()) {
      mesh.visible = mesh.count > 0
      if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true
    }
  })

  return <group ref={groupRef} />
}

/** The limited Sphinx, big and slowly turning on its showcase plinth. */
export function SphinxShowcase() {
  const ref = useRef(null)
  const stock = useGame((s) => s.sphinxStock)
  useEffect(() => {
    updateWorldLabel('sphinx', sphinxLabelSpec(stock))
  }, [stock])
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.6
  })
  const mesh = useMemo(() => asToyInstance(petGeometry('sphinx'), sharedMaterials().toy), [])
  useEffect(() => () => mesh.dispose(), [mesh])
  return <primitive ref={ref} object={mesh} position={[SPHINX_STAND.x, 1.7, SPHINX_STAND.z]} scale={3.2} castShadow />
}

export default Pets

/** The Free Reward stand's crab, bobbing on its pedestal by spawn. */
export function RewardCrab() {
  const ref = useRef(null)
  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    mesh.position.y = 1.15 + Math.abs(Math.sin(t * 2.2)) * 0.25
    mesh.rotation.y = Math.sin(t * 0.8) * 0.5 + Math.PI * 0.15
  })
  const crab = useMemo(() => asToyInstance(petGeometry('crab'), sharedMaterials().toy), [])
  useEffect(() => () => crab.dispose(), [crab])
  return <primitive ref={ref} object={crab} position={[FREE_REWARD.x, 1.15, FREE_REWARD.z]} scale={1.9} castShadow />
}
