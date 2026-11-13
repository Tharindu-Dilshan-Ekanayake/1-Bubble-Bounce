import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SPHINX_STOCK_DEFAULT } from '../../shared/balance.js'
import { normalizeProfile } from '../../shared/logic.js'

/**
 * Persistence, behind one small async API with two backends:
 *
 * - MongoDB when MONGODB_URI is set: Bloxity Legion gives every game (and channel) its
 *   own managed database, shared by all of the game's pods.
 * - Otherwise one SQLite file through Node's built-in driver, for local development.
 *
 * Profiles are stored whole as JSON, with the leaderboard numbers copied alongside so
 * the boards are plain indexed queries.
 *
 * Saves are owned. Loading a profile claims it for the session that loaded it
 * (`owner`), and a save from any other owner is dropped: when a player refreshes, or
 * is moved to another pod, the session they left can never write stale progress over
 * the one they're playing in now.
 *
 * Two Boxity records live here too:
 *
 * - A guest save copied into an account (`carriedTo`) is marked so it is copied once
 *   only, and drops off the in-game boards (the account has it now).
 * - Gems purchases (`gem_grants`), recorded by Boxity's webhook on whichever pod it
 *   reached and applied by the pod the buyer plays on. A grant is claimed atomically
 *   before it is applied, so it lands exactly once however many pods look at it.
 */

const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('../data/tire.db', import.meta.url))

const BOARDS = { rebirths: 'rebirths', wins: 'totalWins', distance: 'bestDistance', playtime: 'playtime' }

const leaderboardFields = (profile) => ({
  name: profile.name,
  rebirths: profile.rebirths,
  totalWins: profile.stats.totalWins,
  playtime: profile.stats.playtime,
  bestDistance: profile.stats.bestDistance,
  updatedAt: profile.lastSeen,
})

/** A guest's saved profile (JSON), re-keyed as account `accountId`'s, under its name. */
function rehome(data, accountId, name) {
  let raw = null
  try {
    raw = JSON.parse(data)
  } catch {
    // A corrupt guest save carries nothing; the account starts fresh.
  }
  const profile = normalizeProfile(raw, accountId, name)
  profile.lastSeen = Date.now()
  return profile
}

async function openMongo(uri) {
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(uri, { maxPoolSize: 10 })
  await client.connect()
  // The database named in the URI: the one Legion scoped to this game.
  const db = client.db()
  const profiles = db.collection('profiles')
  const kv = db.collection('kv')
  const gems = db.collection('gem_grants')
  await Promise.all([
    ...Object.values(BOARDS).map((field) => profiles.createIndex({ [field]: -1 })),
    gems.createIndex({ userId: 1, applied: 1 }),
    kv.updateOne({ _id: 'sphinxStock' }, { $setOnInsert: { value: SPHINX_STOCK_DEFAULT } }, { upsert: true }),
  ])

  return {
    async load(id, owner) {
      const doc = await profiles.findOneAndUpdate({ _id: id }, { $set: { owner } }, { returnDocument: 'after' })
      return doc ? doc.data : null
    },
    async save(profile, owner) {
      try {
        // Matches only while `owner` still owns it; if someone else took it over the
        // upsert collides on _id instead of overwriting their progress.
        await profiles.updateOne(
          { _id: profile.id, owner },
          { $set: { owner, data: JSON.stringify(profile), ...leaderboardFields(profile) } },
          { upsert: true },
        )
        return true
      } catch (err) {
        if (err?.code === 11000) return false
        throw err
      }
    },
    async top(limit) {
      const out = {}
      for (const [board, field] of Object.entries(BOARDS)) {
        const docs = await profiles
          .find({ carriedTo: null }, { projection: { name: 1, [field]: 1 } })
          .sort({ [field]: -1 })
          .limit(limit)
          .toArray()
        out[board] = docs.map((d) => ({ name: d.name, value: d[field] ?? 0 }))
      }
      return out
    },
    async carry(accountId, guestId, name) {
      if (await profiles.findOne({ _id: accountId }, { projection: { _id: 1 } })) return false
      // Claim the guest save first: whatever happens next, it can't be copied twice.
      const guest = await profiles.findOneAndUpdate(
        { _id: guestId, carriedTo: null },
        { $set: { carriedTo: accountId, carriedAt: Date.now() } },
        { returnDocument: 'after' },
      )
      if (!guest) return false
      const profile = rehome(guest.data, accountId, name)
      try {
        await profiles.insertOne({ _id: accountId, owner: null, data: JSON.stringify(profile), ...leaderboardFields(profile) })
        return true
      } catch (err) {
        // The account got a save of its own meanwhile: leave the guest save unused.
        await profiles.updateOne({ _id: guestId, carriedTo: accountId }, { $unset: { carriedTo: '', carriedAt: '' } })
        if (err?.code === 11000) return false
        throw err
      }
    },
    async recordGem(grant) {
      const { transactionId, ...fields } = grant
      const res = await gems.updateOne(
        { _id: transactionId },
        { $setOnInsert: { ...fields, applied: false, receivedAt: Date.now() } },
        { upsert: true },
      )
      return res.upsertedCount > 0
    },
    async pendingGems(userIds) {
      if (!userIds.length) return []
      const docs = await gems.find({ userId: { $in: userIds }, applied: false }, { projection: { userId: 1, sku: 1 } }).toArray()
      return docs.map((d) => ({ transactionId: d._id, userId: d.userId, sku: d.sku }))
    },
    async claimGem(transactionId, by) {
      const doc = await gems.findOneAndUpdate(
        { _id: transactionId, applied: false },
        { $set: { applied: true, appliedAt: Date.now(), appliedBy: by } },
      )
      return Boolean(doc)
    },
    async releaseGem(transactionId, by) {
      await gems.updateOne({ _id: transactionId, appliedBy: by }, { $set: { applied: false }, $unset: { appliedAt: '', appliedBy: '' } })
    },
    async stock() {
      const doc = await kv.findOne({ _id: 'sphinxStock' })
      return doc ? doc.value : SPHINX_STOCK_DEFAULT
    },
    async take() {
      const doc = await kv.findOneAndUpdate({ _id: 'sphinxStock', value: { $gt: 0 } }, { $inc: { value: -1 } }, { returnDocument: 'after' })
      return doc ? doc.value : null
    },
    close: () => client.close(),
  }
}

async function openSqlite(path) {
  const { DatabaseSync } = await import('node:sqlite')
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      rebirths INTEGER NOT NULL DEFAULT 0,
      total_wins REAL NOT NULL DEFAULT 0,
      playtime REAL NOT NULL DEFAULT 0,
      best_distance REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS profiles_rebirths ON profiles (rebirths DESC);
    CREATE INDEX IF NOT EXISTS profiles_wins ON profiles (total_wins DESC);
    CREATE INDEX IF NOT EXISTS profiles_playtime ON profiles (playtime DESC);
    CREATE INDEX IF NOT EXISTS profiles_distance ON profiles (best_distance DESC);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gem_grants (
      txn TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      data TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      applied INTEGER NOT NULL DEFAULT 0,
      applied_at INTEGER,
      applied_by TEXT
    );
    CREATE INDEX IF NOT EXISTS gem_grants_user ON gem_grants (user_id, applied);
  `)
  // Files from before guest carry-over lack the column.
  if (!db.prepare('PRAGMA table_info(profiles)').all().some((c) => c.name === 'carried_to')) {
    db.exec('ALTER TABLE profiles ADD COLUMN carried_to TEXT')
  }
  const columns = { rebirths: 'rebirths', wins: 'total_wins', distance: 'best_distance', playtime: 'playtime' }
  const readStock = () => {
    const row = db.prepare("SELECT value FROM kv WHERE key = 'sphinxStock'").get()
    return row ? Number(row.value) : SPHINX_STOCK_DEFAULT
  }

  // One process owns this file, so `owner` has nothing to guard against here.
  return {
    async load(id) {
      return db.prepare('SELECT data FROM profiles WHERE id = ?').get(id)?.data ?? null
    },
    async save(profile) {
      const f = leaderboardFields(profile)
      db.prepare(
        `INSERT INTO profiles (id, name, data, rebirths, total_wins, playtime, best_distance, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, data = excluded.data, rebirths = excluded.rebirths,
           total_wins = excluded.total_wins, playtime = excluded.playtime,
           best_distance = excluded.best_distance, updated_at = excluded.updated_at`,
      ).run(profile.id, f.name, JSON.stringify(profile), f.rebirths, f.totalWins, f.playtime, f.bestDistance, f.updatedAt)
      return true
    },
    async top(limit) {
      const out = {}
      for (const [board, column] of Object.entries(columns)) {
        out[board] = db
          .prepare(`SELECT name, ${column} AS value FROM profiles WHERE carried_to IS NULL ORDER BY ${column} DESC LIMIT ?`)
          .all(limit)
          .map((r) => ({ name: r.name, value: r.value }))
      }
      return out
    },
    async carry(accountId, guestId, name) {
      if (db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(accountId)) return false
      const guest = db.prepare('SELECT data FROM profiles WHERE id = ? AND carried_to IS NULL').get(guestId)
      if (!guest) return false
      const profile = rehome(guest.data, accountId, name)
      const f = leaderboardFields(profile)
      // Synchronous, so nothing can come between the checks above and these two writes.
      db.prepare('UPDATE profiles SET carried_to = ? WHERE id = ?').run(accountId, guestId)
      db.prepare(
        `INSERT INTO profiles (id, name, data, rebirths, total_wins, playtime, best_distance, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(accountId, f.name, JSON.stringify(profile), f.rebirths, f.totalWins, f.playtime, f.bestDistance, f.updatedAt)
      return true
    },
    async recordGem(grant) {
      const { transactionId, userId, sku, ...rest } = grant
      const res = db
        .prepare('INSERT INTO gem_grants (txn, user_id, sku, data, received_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(txn) DO NOTHING')
        .run(transactionId, userId, sku, JSON.stringify(rest), Date.now())
      return res.changes > 0
    },
    async pendingGems(userIds) {
      if (!userIds.length) return []
      return db
        .prepare(`SELECT txn, user_id, sku FROM gem_grants WHERE applied = 0 AND user_id IN (${userIds.map(() => '?').join(',')})`)
        .all(...userIds)
        .map((r) => ({ transactionId: r.txn, userId: r.user_id, sku: r.sku }))
    },
    async claimGem(transactionId, by) {
      const res = db
        .prepare('UPDATE gem_grants SET applied = 1, applied_at = ?, applied_by = ? WHERE txn = ? AND applied = 0')
        .run(Date.now(), by, transactionId)
      return res.changes > 0
    },
    async releaseGem(transactionId, by) {
      db.prepare('UPDATE gem_grants SET applied = 0, applied_at = NULL, applied_by = NULL WHERE txn = ? AND applied_by = ?').run(
        transactionId,
        by,
      )
    },
    async stock() {
      return readStock()
    },
    async take() {
      const stock = readStock()
      if (stock <= 0) return null
      db.prepare("INSERT INTO kv (key, value) VALUES ('sphinxStock', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
        String(stock - 1),
      )
      return stock - 1
    },
    close: async () => db.close(),
  }
}

let store = null
/** Sphinx stock as last known here; kept current from the database. */
let stock = SPHINX_STOCK_DEFAULT

/** Opens the database: MongoDB if MONGODB_URI is set, else the local SQLite file. */
export async function openStorage({ mongoUri = process.env.MONGODB_URI, path = DB_PATH } = {}) {
  store = mongoUri ? await openMongo(mongoUri) : await openSqlite(path)
  stock = await store.stock()
  console.log(`[db] using ${mongoUri ? 'MongoDB' : `SQLite at ${path}`}`)
}

export async function closeStorage() {
  await store?.close()
  store = null
}

/** Loads (or creates) the profile for `id`, normalised, and claims it for `owner`. */
export async function loadProfile(id, name, owner) {
  const data = await store.load(id, owner)
  let raw = null
  if (data) {
    try {
      raw = JSON.parse(data)
    } catch {
      console.warn(`[db] corrupt profile for ${id}, starting fresh`)
    }
  }
  return normalizeProfile(raw, id, name)
}

/**
 * Saves a profile if `owner` still owns it. Resolves false when it was dropped (owned
 * by a newer session) or failed; never throws, so a save can't break a leave.
 */
export async function saveProfile(profile, owner) {
  profile.lastSeen = Date.now()
  try {
    return await store.save(profile, owner)
  } catch (err) {
    console.error(`[db] save failed for ${profile.id}`, err)
    return false
  }
}

/**
 * Guest progress carry-over: when account `accountId` has no save yet, copies the
 * first of `guestIds` (the guest ids Boxity says this account played as) that has a
 * save not yet carried anywhere. The guest save is marked as carried, so it can never
 * be copied again. Resolves the guest id copied, or null.
 *
 * A guest's save is keyed by the id they played under; on Boxity hosting that is the
 * id with 'guest-' in front when it didn't start with it already (bloxityApi.js), so
 * both spellings are tried.
 */
export async function carryOverGuest(accountId, guestIds, name) {
  const candidates = [...new Set(guestIds.flatMap((id) => (id.startsWith('guest-') ? [id] : [id, `guest-${id}`])))]
  for (const guestId of candidates) {
    if (guestId === accountId) continue
    try {
      if (await store.carry(accountId, guestId, name)) return guestId
    } catch (err) {
      console.error(`[db] carrying ${guestId} into ${accountId} failed`, err)
      return null
    }
  }
  return null
}

/**
 * Records a Gems purchase Boxity confirmed: `{ transactionId, userId, sku, ... }`.
 * Idempotent by transactionId (Boxity may deliver a webhook twice). Resolves true for
 * a new grant, false for one already recorded.
 */
export const recordGemGrant = (grant) => store.recordGem(grant)

/** Unapplied grants for any of `userIds`: `[{ transactionId, userId, sku }]`. */
export const pendingGemGrants = (userIds) => store.pendingGems(userIds)

/**
 * Claims grant `transactionId` for pod `by`. Resolves true for exactly one caller,
 * ever; only that caller may apply it.
 */
export const claimGemGrant = (transactionId, by) => store.claimGem(transactionId, by)

/** Gives back a claim whose player left before the grant could be applied. */
export const releaseGemGrant = (transactionId, by) => store.releaseGem(transactionId, by)

/** Top `limit` players per board: `{ rebirths: [{ name, value }], ... }`. */
export const topPlayers = (limit = 10) => store.top(limit)

export const getSphinxStock = () => stock

/**
 * Takes one Sphinx. Synchronous for the purchase rules: decided on the stock known
 * here, then made permanent in the database, which has the final say (another pod may
 * have sold the last one a moment ago). Returns false when sold out.
 */
export function takeSphinx() {
  if (stock <= 0) return false
  stock -= 1
  store
    .take()
    .then((left) => {
      stock = left ?? 0
    })
    .catch((err) => console.error('[db] sphinx stock update failed', err))
  return true
}

/** Re-reads the stock, so sales on other pods show up here. */
export async function refreshStock() {
  stock = await store.stock()
  return stock
}
