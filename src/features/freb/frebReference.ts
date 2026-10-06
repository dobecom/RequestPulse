import referenceXml from './reference/freb-analysis-reference.xml?raw'
import type { FrebError, FrebPipelineStageId } from '../logs/types'

interface FrebGuidance {
  definition: string
  causes: string[]
  actions: string[]
}

interface ReferenceRule extends FrebGuidance {
  module: string
  modulePattern: string
  status: string
  statusPrefix: string
  errorCode: string
  stage: string
}

const parseReference = () => {
  const document = new DOMParser().parseFromString(referenceXml, 'application/xml')
  const stages = Array.from(document.querySelectorAll('pipeline > stage')).map(
    (stage) => ({
      id: stage.getAttribute('id') as FrebPipelineStageId,
      title: stage.getAttribute('title') || '',
      description: stage.getAttribute('description') || '',
    }),
  )
  const rules = Array.from(document.querySelectorAll('rules > rule')).map(
    (rule): ReferenceRule => ({
      module: rule.getAttribute('module') || '',
      modulePattern: rule.getAttribute('modulePattern') || '',
      status: rule.getAttribute('status') || '',
      statusPrefix: rule.getAttribute('statusPrefix') || '',
      errorCode: rule.getAttribute('errorCode') || '',
      stage: rule.getAttribute('stage') || '',
      definition: rule.querySelector('definition')?.textContent?.trim() || '',
      causes: Array.from(rule.querySelectorAll('causes > cause')).map(
        (cause) => cause.textContent?.trim() || '',
      ),
      actions: Array.from(rule.querySelectorAll('actions > action')).map(
        (action) => action.textContent?.trim() || '',
      ),
    }),
  )
  return { stages, rules }
}

let cachedReference: ReturnType<typeof parseReference> | null = null

const reference = () => {
  cachedReference ??= parseReference()
  return cachedReference
}

const ruleScore = (rule: ReferenceRule, error: FrebError) => {
  let score = 0
  if (rule.module) {
    if (rule.module !== error.moduleName) return -1
    score += 8
  }
  if (rule.modulePattern) {
    if (!error.moduleName.toLowerCase().includes(rule.modulePattern.toLowerCase())) {
      return -1
    }
    score += 4
  }
  if (rule.status) {
    if (rule.status !== error.statusCode) return -1
    score += 8
  }
  if (rule.statusPrefix) {
    if (!error.statusCode.startsWith(rule.statusPrefix)) return -1
    score += 3
  }
  if (rule.errorCode) {
    if (rule.errorCode.toLowerCase() !== error.errorCode.toLowerCase()) return -1
    score += 5
  }
  if (rule.stage) {
    if (rule.stage !== error.stageId) return -1
    score += 2
  }
  return score
}

export function getFrebGuidance(error: FrebError): FrebGuidance {
  const match = reference().rules
    .map((rule) => ({ rule, score: ruleScore(rule, error) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score)[0]?.rule

  return (
    match || {
      definition:
        'FREB recorded a request failure, but the bundled reference does not contain an exact module and status match.',
      causes: [
        'The failure may come from an application-specific or third-party IIS module.',
        'The final status can be downstream evidence rather than the original cause.',
      ],
      actions: [
        'Inspect the failing event and the events immediately before it, then correlate the module, HRESULT, status, and request timestamp with application and Windows evidence.',
        'Validate any configuration change against the effective IIS scope before applying it.',
      ],
    }
  )
}

export function getFrebStageReference(stageId: FrebPipelineStageId) {
  return reference().stages.find((stage) => stage.id === stageId)
}

export function getFrebReferenceStats() {
  return {
    stages: reference().stages.length,
    rules: reference().rules.length,
  }
}
