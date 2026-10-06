import type {
  FrebError,
  FrebPipelineStageId,
  FrebTraceEvent,
  ParsedLogFile,
} from '../logs/types'
import { FREB_PIPELINE_STAGES } from './frebParser'

const samples: Array<{
  name: string
  url: string
  status: string
  module: string
  stage: FrebPipelineStageId
  opcode: string
  errorCode: string
  reason: string
  timeTaken: number
}> = [
  {
    name: 'Sample-fr000101.xml',
    url: 'https://example.test/admin',
    status: '401.503',
    module: 'IpRestrictionModule',
    stage: 'begin-request',
    opcode: 'MODULE_SET_RESPONSE_ERROR_STATUS',
    errorCode: '0x80070005',
    reason: 'Access is denied.',
    timeTaken: 2,
  },
  {
    name: 'Sample-fr000102.xml',
    url: 'https://example.test/api/import',
    status: '404.7',
    module: 'RequestFilteringModule',
    stage: 'begin-request',
    opcode: 'MODULE_SET_RESPONSE_ERROR_STATUS',
    errorCode: '0x80070002',
    reason: 'The requested file extension is denied.',
    timeTaken: 4,
  },
  {
    name: 'Sample-fr000103.xml',
    url: 'https://example.test/reports',
    status: '500.19',
    module: 'ConfigurationValidationModule',
    stage: 'map-handler',
    opcode: 'MODULE_SET_RESPONSE_ERROR_STATUS',
    errorCode: '0x8007000d',
    reason: 'The configuration data is invalid.',
    timeTaken: 11,
  },
  {
    name: 'Sample-fr000104.xml',
    url: 'https://example.test/app',
    status: '500.30',
    module: 'AspNetCoreModuleV2',
    stage: 'execute-handler',
    opcode: 'MODULE_SET_RESPONSE_ERROR_STATUS',
    errorCode: '0x8007023e',
    reason: 'The ASP.NET Core application failed to start.',
    timeTaken: 1460,
  },
  {
    name: 'Sample-fr000105.xml',
    url: 'https://example.test/legacy',
    status: '500.0',
    module: 'FastCgiModule',
    stage: 'execute-handler',
    opcode: 'MODULE_SET_RESPONSE_ERROR_STATUS',
    errorCode: '0x80004005',
    reason: 'The handler returned an unexpected error.',
    timeTaken: 824,
  },
]

const createError = (
  sample: (typeof samples)[number],
): FrebError => {
  const stageLabel =
    FREB_PIPELINE_STAGES.find((stage) => stage.id === sample.stage)?.label || ''
  return {
    key: [
      sample.status,
      sample.module,
      sample.stage,
      sample.opcode,
      sample.errorCode,
    ].join('|'),
    statusCode: sample.status,
    moduleName: sample.module,
    stageId: sample.stage,
    stageLabel,
    opcode: sample.opcode,
    errorCode: sample.errorCode,
    message: `${sample.status} at ${sample.module} during ${stageLabel}: ${sample.reason}`,
  }
}

export const sampleFrebFiles: ParsedLogFile[] = samples.map((sample, index) => {
  const timestamp = Date.UTC(2026, 9, 6, 1, index * 4, 0)
  const error = createError(sample)
  const events: FrebTraceEvent[] = [
    {
      index: 0,
      timestamp,
      level: 0,
      provider: 'WWW Server',
      opcode: 'GENERAL_REQUEST_START',
      moduleName: '',
      stageId: 'receive',
      data: {},
      descriptions: {},
    },
    {
      index: 1,
      timestamp: timestamp + sample.timeTaken,
      level: 3,
      provider: 'WWW Server',
      opcode: sample.opcode,
      moduleName: sample.module,
      stageId: sample.stage,
      data: {
        HttpStatus: sample.status.split('.')[0],
        HttpSubStatus: sample.status.split('.')[1] || '0',
        ErrorCode: sample.errorCode,
      },
      descriptions: { ErrorCode: sample.reason },
    },
  ]
  return {
    id: `sample:freb:${sample.name}`,
    name: sample.name,
    kind: 'freb',
    fields: ['url', 'verb', 'statusCode', 'timeTaken', 'appPoolId', 'processId'],
    rows: [],
    warnings: [],
    size: 18_000 + index * 1200,
    freb: {
      url: sample.url,
      siteId: '1',
      appPoolId: 'SampleAppPool',
      processId: String(4200 + index),
      verb: index === 1 ? 'POST' : 'GET',
      authenticationType: index === 0 ? 'NOT_AVAILABLE' : 'anonymous',
      activityId: `{SAMPLE-${index + 1}}`,
      failureReason: 'STATUS_CODE',
      statusCode: sample.status,
      triggerStatusCode: sample.status,
      timeTaken: sample.timeTaken,
      timestamp,
      computer: 'SAMPLE-IIS',
      events,
      error,
    },
  }
})
