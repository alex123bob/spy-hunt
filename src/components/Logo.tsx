import { t } from '../i18n'

export function Logo({ size = 'm', withText = true }: { size?: 's' | 'm'; withText?: boolean }) {
  return (
    <span className={`logo logo-${size}`}>
      <span className="eye" aria-hidden />
      {withText && <span className="logo-text">{t('app.title')}</span>}
    </span>
  )
}
