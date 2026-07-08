import { describe, expect, it } from 'vitest'
import { salaryFor } from './finance'
import { generateFixtures } from './fixtures'
import { newGame } from './newGame'
import { mulberry32 } from './rng'
import {
  activeSlot, deleteSlot, exportSave, importSave, listSlots, load, loadSlot,
  save, saveToSlot, setActiveSlot,
} from './save'
import { newSeason } from './season'

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size },
  } as Storage
}

describe('save/load', () => {
  it('round-trips a game state', () => {
    const storage = fakeStorage()
    const state = newGame(7)
    save(state, storage)
    expect(load(storage)).toEqual(state)
  })

  it('returns null when nothing is saved', () => {
    expect(load(fakeStorage())).toBeNull()
  })

  it('returns null on version mismatch', () => {
    const storage = fakeStorage()
    storage.setItem('futscript-save', JSON.stringify({ version: 999 }))
    expect(load(storage)).toBeNull()
  })

  it('returns null on corrupted JSON', () => {
    const storage = fakeStorage()
    storage.setItem('futscript-save', '{not json')
    expect(load(storage)).toBeNull()
  })

  it('returns null on literal null', () => {
    const storage = fakeStorage()
    storage.setItem('futscript-save', 'null')
    expect(load(storage)).toBeNull()
  })

  it('migrates a v1 save all the way to v6', () => {
    const storage = fakeStorage()
    const v1 = {
      version: 1, seed: 1, rngState: 1, season: 1, round: 5, userTeamId: 0,
      players: { 1: { id: 1, name: 'P1', age: 25, position: 'GK', level: 50 } },
      teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1] }],
      fixtures: [],
    }
    storage.setItem('futscript-save', JSON.stringify(v1))
    const state = load(storage)
    expect(state!.version).toBe(6)
    expect(state!.players[1]).toMatchObject({
      form: 0, fitness: 100, yellowCards: 0, salary: salaryFor(50), contractSeasons: 2, seasonGoals: 0,
    })
    expect(state!.teams[0]).toMatchObject({
      tactic: 'normal', trainingStyle: 'normal', cash: 1_000_000, division: 1,
      capacity: 25_000, ticketPrice: 15, fanMood: 50,
    })
    expect(state!.transferList).toEqual([])
    expect(state!.gameOver).toBe(false)
    expect(state!.construction).toBeNull()
    expect(state!.allTimeScorers).toEqual([])
    expect(state!.news).toEqual([])
  })

  it('migrates a v2 save to v6', () => {
    const storage = fakeStorage()
    const v2 = {
      version: 2, seed: 1, rngState: 1, season: 1, round: 5, userTeamId: 0,
      players: { 1: {
        id: 1, name: 'P1', age: 25, position: 'GK', level: 50,
        form: 1, fitness: 80, injuredForRounds: 2, suspendedForRounds: 0, yellowCards: 1,
      } },
      teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1], tactic: 'attacking', trainingStyle: 'youth' }],
      fixtures: [],
    }
    storage.setItem('futscript-save', JSON.stringify(v2))
    const state = load(storage)
    expect(state!.version).toBe(6)
    expect(state!.players[1]).toMatchObject({ form: 1, fitness: 80, salary: salaryFor(50), contractSeasons: 2 })
    expect(state!.teams[0]).toMatchObject({ tactic: 'attacking', cash: 1_000_000, capacity: 25_000, ticketPrice: 15, fanMood: 50 })
    expect(state!.loanBalance).toBe(0)
    expect(state!.construction).toBeNull()
    expect(state!.allTimeScorers).toEqual([])
    expect(state!.news).toEqual([])
  })

  it('migrates a v3 save to v6', () => {
    const storage = fakeStorage()
    const v3 = {
      version: 3, seed: 1, rngState: 1, season: 2, round: 9, userTeamId: 0,
      players: { 1: {
        id: 1, name: 'P1', age: 25, position: 'GK', level: 50,
        form: 1, fitness: 80, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 1,
        salary: 5000, contractSeasons: 2,
      } },
      teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1], tactic: 'normal', trainingStyle: 'normal', cash: 500_000 }],
      fixtures: [],
      transferList: [], incomingOffers: [], loanBalance: 100_000, brokeRounds: 2, gameOver: false, finances: [],
    }
    storage.setItem('futscript-save', JSON.stringify(v3))
    const state = load(storage)
    expect(state!.version).toBe(6)
    expect(state!.season).toBe(2) // progress preserved
    expect(state!.round).toBe(9)
    expect(state!.loanBalance).toBe(100_000)
    expect(state!.players[1].seasonGoals).toBe(0)
    expect(state!.teams[0].division).toBe(1) // migrated world lives in Division 1 until expansion
    expect(state!.teams[0]).toMatchObject({ capacity: 25_000, ticketPrice: 15, fanMood: 50 })
    expect(state!.cupFixtures).toEqual([])
    expect(state!.history).toEqual([])
    expect(state!.playFriendlies).toBe(false)
    expect(state!.construction).toBeNull()
    expect(state!.allTimeScorers).toEqual([])
    expect(state!.news).toEqual([])
  })

  it('migrates a v4 save to v6', () => {
    const storage = fakeStorage()
    const v4 = {
      version: 4, seed: 1, rngState: 1, season: 3, round: 12, userTeamId: 0,
      players: { 1: {
        id: 1, name: 'P1', age: 25, position: 'GK', level: 50,
        form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
        salary: 5000, contractSeasons: 2, seasonGoals: 3,
      } },
      teams: [
        { id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1], tactic: 'normal', trainingStyle: 'normal', cash: 500_000, division: 3 },
        { id: 1, name: 'T1', playerIds: [], formation: '4-4-2', lineup: [], tactic: 'normal', trainingStyle: 'normal', cash: 500_000, division: 1 },
      ],
      fixtures: [], cupFixtures: [], history: [], playFriendlies: true,
      transferList: [], incomingOffers: [], loanBalance: 0, brokeRounds: 0, gameOver: false, finances: [],
    }
    storage.setItem('futscript-save', JSON.stringify(v4))
    const state = load(storage)
    expect(state!.version).toBe(6)
    expect(state!.season).toBe(3) // progress preserved
    expect(state!.playFriendlies).toBe(true)
    expect(state!.teams[0]).toMatchObject({ capacity: 9_000, ticketPrice: 15, fanMood: 50 }) // division 3
    expect(state!.teams[1]).toMatchObject({ capacity: 25_000 }) // division 1
    expect(state!.construction).toBeNull()
    expect(state!.allTimeScorers).toEqual([])
    expect(state!.news).toEqual([])
  })

  it('migrates a v5 save to v6 with an empty news feed', () => {
    const storage = fakeStorage()
    const v5 = { ...JSON.parse(JSON.stringify(newGame(3))), version: 5 } as Record<string, unknown>
    delete v5.news
    storage.setItem('futscript-save', JSON.stringify(v5))
    const state = load(storage)
    expect(state!.version).toBe(6)
    expect(state!.news).toEqual([])
    expect(state!.season).toBe(1)
  })

  it('a migrated 16-team world expands to three divisions at its first rollover', () => {
    const storage = fakeStorage()
    // minimal-but-valid v3 world: reuse a real 48-team game and keep only division 1,
    // stripping every v4/v5 field so the payload is version-3-shaped
    const base = newGame(77)
    const div1 = base.teams.filter(t => t.division === 1)
    const keep = new Set(div1.flatMap(t => t.playerIds))
    const { cupFixtures: _c, history: _h, playFriendlies: _p, construction: _k, allTimeScorers: _a, ...v3state } = base
    void _c; void _h; void _p; void _k; void _a
    const v3ish = {
      ...v3state,
      version: 3,
      // newGame seats the user at a random Division 3 club (excluded below) —
      // re-point userTeamId at a retained Division 1 club so the world stays internally consistent
      userTeamId: div1[0].id,
      fixtures: [],
      teams: div1.map(t => {
        const { division: _d, capacity: _cap, ticketPrice: _t, fanMood: _f, ...v3team } = t
        void _d; void _cap; void _t; void _f
        return v3team
      }),
      players: Object.fromEntries(
        Object.entries(base.players)
          .filter(([id]) => keep.has(Number(id)))
          .map(([id, p]) => {
            const { seasonGoals: _g, ...v3player } = p
            void _g
            return [id, v3player]
          }),
      ),
    }
    storage.setItem('futscript-save', JSON.stringify(v3ish))
    const migrated = load(storage)!
    expect(migrated.version).toBe(6)
    expect(migrated.teams).toHaveLength(16)
    expect(migrated.teams.every(t => t.division === 1)).toBe(true)
    // give it played fixtures so standings/prizes are meaningful, then roll over
    const played = { ...migrated, fixtures: generateFixtures(migrated.teams.map(t => t.id), mulberry32(1)).map(f => ({ ...f, homeGoals: 1, awayGoals: 0 })) }
    const next = newSeason(played)
    expect(next.teams).toHaveLength(48)
    for (const d of [1, 2, 3]) expect(next.teams.filter(t => t.division === d)).toHaveLength(16)
    expect(next.fixtures).toHaveLength(720)
    expect(next.cupFixtures).toHaveLength(16)
    expect(next.history).toHaveLength(1)
    expect(next.history[0].cupWinner).toBe('—')
    expect(next.history[0].champions).toHaveLength(1)
    expect(next.teams.every(t => t.capacity > 0 && t.fanMood >= 0)).toBe(true)
  })
})

describe('save slots', () => {
  it('adopts a legacy save into slot 1 and keeps loading it', () => {
    const storage = fakeStorage()
    storage.setItem('futscript-save', JSON.stringify(newGame(5)))
    const state = load(storage)
    expect(state).not.toBeNull()
    expect(storage.getItem('futscript-save')).toBeNull() // legacy key removed
    expect(storage.getItem('futscript-slot-1')).not.toBeNull()
    expect(activeSlot(storage)).toBe(1)
  })

  it('saves to the active slot and round-trips per slot', () => {
    const storage = fakeStorage()
    const a = newGame(1)
    const b = newGame(2)
    save(a, storage) // active defaults to 1
    setActiveSlot(2, storage)
    save(b, storage)
    expect(load(storage)!.seed).toBe(2) // active slot 2
    setActiveSlot(1, storage)
    expect(load(storage)!.seed).toBe(1)
    expect(loadSlot(2, storage)!.seed).toBe(2)
  })

  it('lists slot summaries and deletes', () => {
    const storage = fakeStorage()
    const s = newGame(3)
    saveToSlot(s, 2, storage)
    const slots = listSlots(storage)
    expect(slots[0]).toBeNull()
    expect(slots[1]).toMatchObject({ slot: 2, season: 1, division: 3 })
    expect(slots[1]!.teamName).toBe(s.teams.find(t => t.id === s.userTeamId)!.name)
    deleteSlot(2, storage)
    expect(listSlots(storage)[1]).toBeNull()
  })

  it('exports and imports across versions', () => {
    const s = newGame(4)
    const round = importSave(exportSave(s))
    expect(round).toEqual(s)
    // an old v3-era export still imports via the migration chain
    const v3ish: Record<string, unknown> = { ...JSON.parse(exportSave(s)) }
    v3ish.version = 4
    delete v3ish.construction
    delete v3ish.allTimeScorers
    ;(v3ish.teams as Record<string, unknown>[]).forEach(t => {
      delete t.capacity; delete t.ticketPrice; delete t.fanMood
    })
    const imported = importSave(JSON.stringify(v3ish))
    expect(imported).not.toBeNull()
    expect(imported!.version).toBe(6)
    expect(importSave('not json at all')).toBeNull()
    expect(importSave('{"version": 999}')).toBeNull()
    expect(importSave('{"version": 5}')).toBeNull()
    expect(importSave(JSON.stringify({ version: 5, teams: [], players: {}, userTeamId: 0 }))).toBeNull()
  })
})
