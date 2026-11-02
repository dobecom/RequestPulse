import type { LogInputKind, LogKind } from '../logs/types'

/** Tabs that show synthetic evidence until matching files are added. */
export type UploadTab = 'w3svc' | 'httperr' | 'events' | 'freb' | 'config'

/** Restricts what an upload entry point may add and what to tell the user when a file is refused. */
export interface UploadScope {
  /** Parsed kinds this entry point may add. */
  accepts: LogKind[]
  /** Shown in the failure toast so the user knows which files belong here. */
  guidance: string
}

export interface UploadTarget {
  expected: LogInputKind
  /** `accept` attribute for the fallback file input. */
  accept: string
  /** Line shown under the sample-data notice title. */
  notice: string
  scope: UploadScope
}

export const UPLOAD_TARGETS: Record<UploadTab, UploadTarget> = {
  w3svc: {
    expected: 'w3svc',
    accept: '.log,.txt',
    notice: 'Upload your W3SVC log files to analyze your actual IIS traffic.',
    scope: {
      accepts: ['w3svc'],
      guidance:
        'Add W3SVC (IIS access) log files here: .log or .txt files that contain a #Fields directive.',
    },
  },
  httperr: {
    expected: 'httperr',
    accept: '.log,.txt',
    notice:
      'Upload your HTTPERR log files to analyze your actual HTTP.sys rejection evidence.',
    scope: {
      accepts: ['httperr'],
      guidance: 'Add HTTPERR log files here: .log or .txt files from the HTTPERR folder.',
    },
  },
  events: {
    expected: 'eventlog',
    accept: '.evtx,.xml',
    notice:
      'Upload your Application and System Event Viewer log files to analyze your actual Windows event evidence.',
    scope: {
      accepts: ['event-application', 'event-system'],
      guidance:
        'Add Application or System Event Viewer files here: native .evtx files or Event Viewer .xml exports.',
    },
  },
  freb: {
    expected: 'freb',
    accept: '.xml',
    notice:
      'Upload one or more FREB XML files to analyze your actual IIS failed-request traces.',
    scope: {
      accepts: ['freb'],
      guidance:
        'Add IIS Failed Request Tracing files here: .xml files whose root element is <failedRequest>.',
    },
  },
  config: {
    expected: 'config',
    accept: '.config,.xml',
    notice:
      'Upload your applicationHost.config or web.config files to analyze your actual IIS environment.',
    scope: {
      accepts: ['config-applicationhost', 'config-web'],
      guidance:
        'Add IIS configuration files here: applicationHost.config or web.config (.config or .xml).',
    },
  },
}

const KIND_LABELS: Record<LogKind, string> = {
  w3svc: 'a W3SVC log',
  httperr: 'an HTTPERR log',
  freb: 'a FREB trace',
  'event-application': 'an Application event log',
  'event-system': 'a System event log',
  'config-applicationhost': 'an applicationHost.config file',
  'config-web': 'a web.config file',
}

export function describeKind(kind: LogKind): string {
  return KIND_LABELS[kind]
}
