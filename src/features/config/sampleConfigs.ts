import { parseConfigText } from './configParser'
import applicationHostText from './samples/synthetic-applicationHost.config?raw'
import webConfigText from './samples/synthetic-web.config?raw'
import type { ParsedLogFile } from '../logs/types'

export const SAMPLE_APPLICATION_HOST_NAME = 'Synthetic-applicationHost.config'
export const SAMPLE_WEB_CONFIG_NAME = 'Synthetic-web.config'

/** Target id to sample web.config file name; the dashboard resolves names to file ids. */
export const sampleConfigAttachments: Record<string, string> = {
  'site:4': SAMPLE_WEB_CONFIG_NAME,
}

let cached: ParsedLogFile[] | undefined

/** Parses the bundled synthetic IIS configuration once and reuses it. */
export function getSampleConfigFiles(): ParsedLogFile[] {
  cached ??= [
    parseConfigText(
      applicationHostText,
      SAMPLE_APPLICATION_HOST_NAME,
      applicationHostText.length,
      'config-applicationhost',
    ),
    parseConfigText(webConfigText, SAMPLE_WEB_CONFIG_NAME, webConfigText.length, 'config-web'),
  ]
  return cached
}
