/** The live label batch, for systems that relabel things (pads, stock counters). */
let activeBatch = null
/** Updates requested before the batch finished building, applied once it has. */
const pending = new Map()

export function setActiveLabelBatch(batch) {
  activeBatch = batch
  if (!batch) return
  for (const [id, spec] of pending) batch.update(id, spec)
  pending.clear()
}

export function getActiveLabelBatch() {
  return activeBatch
}

/** Redraws one world label (now, or as soon as the labels have built). */
export function updateWorldLabel(id, spec) {
  if (activeBatch) activeBatch.update(id, spec)
  else pending.set(id, spec)
}
