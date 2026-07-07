import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { newGame } from '../engine/newGame'
import {
  activeSlot, deleteSlot, exportSave, importSave, listSlots, loadSlot,
  saveToSlot, setActiveSlot, SLOTS,
} from '../engine/save'
import type { GameState } from '../engine/types'
import { setLang, t, useLang } from '../i18n'
import type { Lang } from '../i18n'
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
  const lang = useLang()
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
      push({ tone: 'danger', text: t('saves.invalidFile') })
      return
    }
    saveToSlot(imported, active)
    setState(imported)
    refresh()
  }

  return (
    <div>
      <ScreenHeader label={t('saves.header')} title={t('saves.title')} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {SLOTS.map((slot, i) => {
          const info = slots[i]
          const isActive = slot === active
          return (
            <Panel key={slot} label={t('saves.slotLabel', { slot })} action={isActive && <Badge tone="accent">{t('saves.activeBadge')}</Badge>}>
              <div className="flex flex-col gap-3">
                {info ? (
                  <p className="text-sm">
                    {info.teamName} — {t('saves.slotSummary', { season: info.season, division: info.division })}, <MoneyText amount={info.cash} />
                  </p>
                ) : (
                  <EmptyState>{t('saves.emptySlot')}</EmptyState>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { saveToSlot(state, slot); setActiveSlot(slot); refresh() }}
                  >
                    {t('saves.saveHereButton')}
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
                      {t('saves.loadButton')}
                    </Button>
                  )}
                  {info && (
                    <ConfirmButton
                      label={t('saves.deleteButton')}
                      confirmLabel={t('saves.confirmDelete')}
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

      <Panel label={t('saves.backupPanel')} className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={download}>{t('saves.exportButton')}</Button>
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>{t('saves.importButton')}</Button>
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
          {t('saves.importNote', { slot: active })}
        </p>
      </Panel>

      <Panel label={t('saves.settings')} className="mt-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">{t('saves.language')}</span>
          <select
            value={lang}
            onChange={e => setLang(e.target.value as Lang)}
            aria-label={t('saves.language')}
            className="rounded-md border border-rule bg-surface px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <option value="en">{t('saves.languageEnglish')}</option>
            <option value="pt">{t('saves.languagePortuguese')}</option>
          </select>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">{t('saves.newCareer')}</span>
          <ConfirmButton
            label={t('saves.newCareer')}
            confirmLabel={t('saves.newCareerConfirm')}
            onConfirm={() => setState(newGame(Date.now() % 2147483647))}
          />
        </div>
      </Panel>
    </div>
  )
}
