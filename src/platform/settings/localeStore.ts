import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const LOCALE_STORAGE_KEY = 'BizyAir.Locale'

function normalizeLocale(value: string | null | undefined) {
  const candidate = value?.trim().replaceAll('_', '-')
  if (!candidate) return

  try {
    return Intl.getCanonicalLocales(candidate)[0]
  } catch {
    return
  }
}

function getBrowserLocale() {
  return normalizeLocale(navigator.language.split('-')[0]) ?? 'en'
}

function getStoredLocale() {
  try {
    return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return
  }
}

export function hasStoredLocalePreference() {
  return getStoredLocale() !== undefined
}

export function getInitialLocale() {
  return getStoredLocale() ?? getBrowserLocale()
}

export const useLocaleStore = defineStore('locale', () => {
  const initialLocale = getInitialLocale()
  const locale = useLocalStorage(LOCALE_STORAGE_KEY, initialLocale, {
    writeDefaults: false
  })

  const normalizedLocale = normalizeLocale(locale.value)
  if (normalizedLocale === undefined) {
    locale.value = initialLocale
  } else if (normalizedLocale !== locale.value) {
    locale.value = normalizedLocale
  }

  function setLocale(value: string) {
    const normalizedValue = normalizeLocale(value)
    if (normalizedValue === undefined) return false

    locale.value = normalizedValue
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, normalizedValue)
    } catch {
      // The reactive value still applies for this session when storage is unavailable.
    }
    return true
  }

  function migrateLegacyLocale(value: string | undefined) {
    if (hasStoredLocalePreference() || value === undefined) return false
    return setLocale(value)
  }

  return {
    locale,
    setLocale,
    migrateLegacyLocale
  }
})
