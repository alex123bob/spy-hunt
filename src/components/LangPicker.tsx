import { LANGS, type Lang } from '../api/types'
import { t } from '../i18n'

export function LangPicker({ value, onChange, label = 'Language' }: { value: Lang; onChange: (l: Lang) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="langpicker">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          className={`btn chip ${value === l ? 'primary' : ''}`}
          onClick={() => onChange(l)}
        >
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  )
}
