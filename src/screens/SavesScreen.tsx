import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatMoney } from '../engine/finance'
import {
  activeSlot, deleteSlot, exportSave, importSave, listSlots, loadSlot,
  saveToSlot, setActiveSlot, SLOTS,
} from '../engine/save'
import type { GameState } from '../engine/types'

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function SavesScreen({ state, setState }: Props) {
  const [, bump] = useState(0) // slots live in localStorage; re-render after writes
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [importError, setImportError] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const slots = listSlots()
  const active = activeSlot()

  const refresh = () => bump(n => n + 1)

  const download = () => {
    const blob = new Blob([exportSave(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `futscript-season-${state.season}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImportFile = async (file: File) => {
    const imported = importSave(await file.text())
    if (!imported) {
      setImportError(true)
      return
    }
    setImportError(false)
    saveToSlot(imported, active)
    setState(imported)
    refresh()
  }

  return (
    <div>
      <h3>Save slots</h3>
      <table>
        <thead>
          <tr><th>Slot</th><th>Career</th><th></th></tr>
        </thead>
        <tbody>
          {SLOTS.map((slot, i) => {
            const info = slots[i]
            return (
              <tr key={slot} className={slot === active ? 'user' : ''}>
                <td>{slot}{slot === active ? ' (active)' : ''}</td>
                <td>
                  {info
                    ? `${info.teamName} — Season ${info.season}, Division ${info.division}, ${formatMoney(info.cash)}`
                    : 'empty'}
                </td>
                <td className="actions">
                  <button onClick={() => { saveToSlot(state, slot); setActiveSlot(slot); refresh() }}>
                    Save here
                  </button>
                  {info && slot !== active && (
                    <button onClick={() => {
                      const loaded = loadSlot(slot)
                      if (loaded) { setActiveSlot(slot); setState(loaded); refresh() }
                    }}>
                      Load
                    </button>
                  )}
                  {info && (confirmDelete === slot ? (
                    <>
                      <button onClick={() => { deleteSlot(slot); setConfirmDelete(null); refresh() }}>
                        Confirm delete
                      </button>
                      <button onClick={() => setConfirmDelete(null)}>✕</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(slot)}>Delete</button>
                  ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <h3>Backup</h3>
      <div className="controls">
        <button onClick={download}>Export current game</button>{' '}
        <button onClick={() => fileInput.current?.click()}>Import from file…</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) void onImportFile(file)
            e.target.value = ''
          }}
        />
        {importError && <p className="banner">⚠ That file is not a valid futscript save.</p>}
      </div>
      <p>Importing replaces the active slot. Deleting slot {active} (the active one) keeps your in-memory game until the next autosave.</p>
    </div>
  )
}
