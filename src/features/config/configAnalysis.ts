import referenceXml from './reference/iis-configuration-reference.xml?raw'
import arrReferenceXml from './reference/arr-configuration-reference.xml?raw'
import type { ParsedLogFile } from '../logs/types'

export type FindingSeverity = 'high' | 'medium' | 'low' | 'info'

export interface ReferenceOption {
  section: string
  elementPath: string
  attribute: string
  defaultValue?: string
  type: string
  timeSpanFormat?: string
  description?: string
  learn?: string
  isKey: boolean
}

interface RiskRule {
  path: string
  attribute: string
  operator: string
  value: string
  severity: FindingSeverity
  title: string
  comment: string
  recommendation: string
}

export interface ConfigFinding {
  id: string
  fileName: string
  scope: string
  path: string
  attribute: string
  value: string
  defaultValue?: string
  severity: FindingSeverity
  title: string
  comment: string
  recommendation: string
}

const normalizeValue = (value: string) => value.trim().toLowerCase()

const INFINITE_SECONDS = Number.POSITIVE_INFINITY

const timeSpanSeconds = (raw: string, format?: string) => {
  const value = raw.trim()
  if (/^infinite$/i.test(value)) return INFINITE_SECONDS
  const match = /^(?:(\d+)\.)?(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value)
  if (match) {
    const seconds =
      Number(match[1] ?? 0) * 86400 +
      Number(match[2]) * 3600 +
      Number(match[3]) * 60 +
      Number(match[4])
    return seconds >= 922337203685 ? INFINITE_SECONDS : seconds
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const unit = format === 'minutes' ? 60 : format === 'hours' ? 3600 : 1
  return numeric * unit
}

const flagSet = (value: string) =>
  new Set(
    value
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  )

/** Compares a configured value with a schema default using the option's data type. */
export function matchesDefault(
  option: Pick<ReferenceOption, 'type' | 'defaultValue' | 'timeSpanFormat'>,
  actual: string,
) {
  const expected = option.defaultValue ?? ''
  if (option.type === 'timeSpan') {
    const left = timeSpanSeconds(actual, option.timeSpanFormat)
    const right = timeSpanSeconds(expected, option.timeSpanFormat)
    if (left !== null && right !== null) return left === right
  }
  if (option.type === 'flags') {
    const left = flagSet(actual)
    const right = flagSet(expected)
    return left.size === right.size && [...left].every((flag) => right.has(flag))
  }
  if (['uint', 'int', 'long', 'ulong', 'int64', 'uint64'].includes(option.type)) {
    const left = Number(actual)
    const right = Number(expected)
    if (actual.trim() !== '' && Number.isFinite(left) && Number.isFinite(right)) {
      return left === right
    }
  }
  return normalizeValue(actual) === normalizeValue(expected)
}

const wildcardMatches = (pattern: string, value: string) => {
  const patternParts = pattern.split('/')
  const valueParts = value.split('/')
  return (
    patternParts.length === valueParts.length &&
    patternParts.every(
      (part, index) => part === '*' || part === valueParts[index],
    )
  )
}

const ruleMatches = (rule: RiskRule, value: string) => {
  const actual = normalizeValue(value)
  const expected = normalizeValue(rule.value)
  if (rule.operator === 'equals') return actual === expected
  if (rule.operator === 'notEquals') return actual !== expected
  const actualNumber = Number(actual)
  const expectedNumber = Number(expected)
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) {
    return false
  }
  if (rule.operator === 'greaterThan') return actualNumber > expectedNumber
  if (rule.operator === 'lessThan') return actualNumber < expectedNumber
  return false
}

const parseReference = () => {
  const options: ReferenceOption[] = []
  const risks: RiskRule[] = []

  ;[referenceXml, arrReferenceXml].forEach((xml) => {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    document.querySelectorAll('section').forEach((section) => {
      const sectionPath = section.getAttribute('path') || ''
      section.querySelectorAll(':scope > option').forEach((option) => {
        options.push({
          section: sectionPath,
          elementPath: option.getAttribute('elementPath') || '',
          attribute: option.getAttribute('name') || '',
          defaultValue: option.hasAttribute('defaultValue')
            ? option.getAttribute('defaultValue') || ''
            : undefined,
          type: option.getAttribute('type') || 'string',
          timeSpanFormat: option.getAttribute('timeSpanFormat') || undefined,
          description: option.getAttribute('description') || undefined,
          learn: section.getAttribute('learn') || undefined,
          isKey:
            option.getAttribute('isUniqueKey') === 'true' ||
            option.getAttribute('isCombinedKey') === 'true',
        })
      })
    })

    document.querySelectorAll('risk').forEach((risk) => {
      risks.push({
        path: risk.getAttribute('path') || '',
        attribute: risk.getAttribute('attribute') || '',
        operator: risk.getAttribute('operator') || '',
        value: risk.getAttribute('value') || '',
        severity: (risk.getAttribute('severity') || 'info') as FindingSeverity,
        title: risk.getAttribute('title') || 'Configuration review',
        comment: risk.getAttribute('comment') || '',
        recommendation: risk.getAttribute('recommendation') || '',
      })
    })
  })

  const index = new Map<string, ReferenceOption>()
  options.forEach((option) => {
    const key = `${option.section}\u0000${option.elementPath}\u0000${option.attribute}`
    if (!index.has(key)) index.set(key, option)
  })
  const sections = new Set(options.map((option) => option.section))

  return { options, risks, index, sections }
}

let cachedReference: ReturnType<typeof parseReference> | null = null

const reference = () => {
  cachedReference ??= parseReference()
  return cachedReference
}

export const findReferenceOption = (path: string, attribute: string) => {
  const { index } = reference()
  const segments = path.split('/')
  for (let length = segments.length; length > 0; length -= 1) {
    const section = segments.slice(0, length).join('/')
    const elementPath = segments.slice(length).join('/')
    const option = index.get(`${section}\u0000${elementPath}\u0000${attribute}`)
    if (option) return option
  }
  return undefined
}

const hasKnownSection = (path: string) => {
  const { sections } = reference()
  const segments = path.split('/')
  for (let length = segments.length; length > 0; length -= 1) {
    if (sections.has(segments.slice(0, length).join('/'))) return true
  }
  return false
}

export const matchRiskRule = (path: string, attribute: string, value: string) =>
  reference().risks.find(
    (candidate) =>
      candidate.attribute === attribute &&
      wildcardMatches(candidate.path, path) &&
      ruleMatches(candidate, value),
  )

export const isSensitiveAttribute = (attribute: string) =>
  /(password|secret|token|connectionstring|apikey|keyvalue)/i.test(attribute)

const displayValue = (attribute: string, value: string) =>
  isSensitiveAttribute(attribute) ? 'Sensitive value present (hidden)' : value

export function analyzeConfigFile(file: ParsedLogFile): ConfigFinding[] {
  if (!file.config) return []

  return file.config.settings.flatMap((setting) => {
    const option = findReferenceOption(setting.path, setting.attribute)
    const risk = matchRiskRule(setting.path, setting.attribute, setting.value)
    const differsFromDefault =
      option?.defaultValue !== undefined && !matchesDefault(option, setting.value)
    const unknownSetting = !option && !hasKnownSection(setting.path)

    if (!risk && !differsFromDefault && !unknownSetting) return []

    return [
      {
        id: `${file.id}:${setting.id}`,
        fileName: file.name,
        scope: setting.scope,
        path: setting.displayPath,
        attribute: setting.attribute,
        value: displayValue(setting.attribute, setting.value),
        defaultValue: option?.defaultValue,
        severity: risk?.severity || 'info',
        title:
          risk?.title ||
          (unknownSetting
            ? 'Custom or unrecognized configuration'
            : 'Non-default IIS configuration'),
        comment:
          risk?.comment ||
          (unknownSetting
            ? 'This explicit setting is not defined by the bundled Microsoft IIS schemas and may belong to an application or third-party extension.'
            : `This explicit value differs from the Microsoft IIS schema default for a ${option?.type || 'configuration'} option.`),
        recommendation:
          risk?.recommendation ||
          (unknownSetting
            ? 'Identify the owning module or application documentation and verify the setting, scope, and handling of sensitive values.'
            : 'Confirm that the override is intentional and validate its effect in the applicable server, site, application, or directory scope.'),
      },
    ]
  })
}

export function getReferenceStats() {
  return {
    sections: new Set(reference().options.map((option) => option.section)).size,
    options: reference().options.length,
    riskRules: reference().risks.length,
  }
}
