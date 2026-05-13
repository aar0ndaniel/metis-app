export type AppEdition = 'Bundle' | 'Lite'

export const APP_BRAND_NAME = __METIS_APP_NAME__
export const APP_VERSION = __METIS_APP_VERSION__
export const APP_RELEASE_CHANNEL = __METIS_RELEASE_CHANNEL__
export const APP_EDITION = (__METIS_APP_EDITION__ === 'Lite' ? 'Lite' : 'Bundle') as AppEdition
export const APP_VERSION_LABEL = APP_VERSION
export const APP_BASE_RELEASE_LABEL = APP_VERSION

export function getEditionReleaseLabel(edition: AppEdition): string {
  return `${APP_RELEASE_CHANNEL} ${edition}`
}

export const APP_TITLE_RELEASE_LABEL = getEditionReleaseLabel(APP_EDITION)
