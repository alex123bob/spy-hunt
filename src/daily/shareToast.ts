import { t } from '../i18n'
import type { ShareOutcome } from './share'

/** Toast text for a share outcome; '' (no toast) when the user cancelled the native sheet. */
export function shareToast(r: ShareOutcome, keys: { shared: string; copied: string; failed: string }): string {
  return r === 'cancelled' ? '' : r === 'shared' ? t(keys.shared) : r === 'copied' ? t(keys.copied) : t(keys.failed)
}
