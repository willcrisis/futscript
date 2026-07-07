import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  activeSlot, deleteSlot, exportSave, importSave, listSlots, loadSlot,
  saveToSlot, setActiveSlot, SLOTS,
} from '../engine/save'
import type { GameState } from '../engine/types'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import ConfirmButton from '../ui/ConfirmButton'
import EmptyState from '../ui/EmptyState'
import MoneyText from '../ui/MoneyText'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'
import { useToasts } from '../ui/Toast'

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function SavesScreen({ state, setState }: Props) {
  const [, bump] = useState(0) // slots live in localStorage; re-render after writes
  const fileInput = useRef<HTMLInputElement>(null)
  const { push } = useToasts()
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
      push({ tone: 'danger', text: 'That file is not a valid futscript save.' })
      return
    }
    saveToSlot(imported, active)
    setState(imported)
    refresh()
  }

  return (
    <div>
      <ScreenHeader label="CAREERS" title="Saves" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {SLOTS.map((slot, i) => {
          const info = slots[i]
          const isActive = slot === active
          return (
            <Panel key={slot} label={`SLOT ${slot}`} action={isActive && <Badge tone="accent">active</Badge>}>
              <div className="flex flex-col gap-3">
                {info ? (
                  <p className="text-sm">
                    {info.teamName} — Season {info.season}, Division {info.division}, <MoneyText amount={info.cash} />
                  </p>
                ) : (
                  <EmptyState>empty</EmptyState>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { saveToSlot(state, slot); setActiveSlot(slot); refresh() }}
                  >
                    Save here
                  </Button>
                  {info && !isActive && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        const loaded = loadSlot(slot)
                        if (loaded) { setActiveSlot(slot); setState(loaded); refresh() }
                      }}
                    >
                      Load
                    </Button>
                  )}
                  {info && (
                    <ConfirmButton
                      label="Delete"
                      confirmLabel="Confirm delete"
                      onConfirm={() => { deleteSlot(slot); refresh() }}
                      size="sm"
                    />
                  )}
                </div>
              </div>
            </Panel>
          )
        })}
      </div>

      <Panel label="Backup" className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={download}>Export current game</Button>
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>Import from file…</Button>
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
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Importing replaces the active slot. Deleting slot {active} (the active one) keeps your in-memory game
          until the next autosave.
        </p>
      </Panel>
    </div>
  )
}
