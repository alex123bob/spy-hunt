import { t } from '../i18n'
import { ApiError } from './client'

export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return t('error.generic')
  if (e.status === 0) return t('error.network')
  const key = `error.code.${e.code}`
  return t(key) !== key ? t(key) : t('error.generic')
}
