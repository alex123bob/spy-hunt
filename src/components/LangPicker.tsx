import { LANGS, type Lang } from '../api/types'
import { t } from '../i18n'

export function LangPicker({ value, onChange, label = 'Language', compact = false }: { value: Lang; onChange: (l: Lang) => void; label?: string; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={`segmented langpicker${compact ? ' compact' : ''}`}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          className={'chip'}
          aria-label={compact ? t(`lang.${l}`) : undefined}
          onClick={() => onChange(l)}
        >
          {compact ? t(`lang.short.${l}`) : t(`lang.${l}`)}
        </button>
      ))}
    </div>
  )
}
