import referenceXml from './reference/iis-configuration-reference.xml?raw'
import type { ParsedLogFile } from '../logs/types'

export type FindingSeverity = 'high' | 'medium' | 'low' | 'info'

interface ReferenceOption {
  section: string
  elementPath: string
  attribute: string
  defaultValue?: string
  type: string
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
  const document = new DOMParser().parseFromString(referenceXml, 'application/xml')
  const options: ReferenceOption[] = []
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
      })
    })
  })

  const risks = Array.from(document.querySelectorAll('risk')).map((risk) => ({
    path: risk.getAttribute('path') || '',
    attribute: risk.getAttribute('attribute') || '',
    operator: risk.getAttribute('operator') || '',
    value: risk.getAttribute('value') || '',
    severity: (risk.getAttribute('severity') || 'info') as FindingSeverity,
    title: risk.getAttribute('title') || 'Configuration review',
    comment: risk.getAttribute('comment') || '',
    recommendation: risk.getAttribute('recommendation') || '',
  }))

  return { options, risks }
}

let cachedReference: ReturnType<typeof parseReference> | null = null

const reference = () => {
  cachedReference ??= parseReference()
  return cachedReference
}

const findReferenceOption = (path: string, attribute: string) => {
  const candidates = reference().options.filter(
    (option) =>
      path === option.section || path.startsWith(`${option.section}/`),
  )
  return candidates
    .sort((left, right) => right.section.length - left.section.length)
    .find((option) => {
      const elementPath = path.slice(option.section.length).replace(/^\//, '')
      return option.elementPath === elementPath && option.attribute === attribute
    })
}

const hasKnownSection = (path: string) =>
  reference().options.some(
    (option) => path === option.section || path.startsWith(`${option.section}/`),
  )

const displayValue = (attribute: string, value: string) =>
  /(password|secret|token|connectionstring|apikey|keyvalue)/i.test(attribute)
    ? 'Sensitive value present (hidden)'
    : value

export function analyzeConfigFile(file: ParsedLogFile): ConfigFinding[] {
  if (!file.config) return []

  return file.config.settings.flatMap((setting) => {
    const option = findReferenceOption(setting.path, setting.attribute)
    const risk = reference().risks.find(
      (candidate) =>
        candidate.attribute === setting.attribute &&
        wildcardMatches(candidate.path, setting.path) &&
        ruleMatches(candidate, setting.value),
    )
    const differsFromDefault =
      option?.defaultValue !== undefined &&
      normalizeValue(option.defaultValue) !== normalizeValue(setting.value)
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
