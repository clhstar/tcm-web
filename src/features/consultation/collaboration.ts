import type { TcmFlowSseEvent } from '../../api/consultation'
import { isRecord, readRootStreamPayload } from '../../api/langGraphStream'

export type CollaborationStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed'

export type CollaborationAgent =
  | 'IntentAgent'
  | 'InquiryAgent'
  | 'EvidenceAgent'
  | 'SyndromeAgent'
  | 'AnswerAgent'
  | 'SafetyAgent'

export type CollaborationStep = {
  id: string
  agent: CollaborationAgent
  label: string
  status: CollaborationStatus
  summary: string
}

const WORKFLOW_DEFINITIONS: ReadonlyArray<{
  agent: CollaborationAgent
  label: string
}> = [
  { agent: 'IntentAgent', label: '意图识别 Agent' },
  { agent: 'InquiryAgent', label: '问诊分析 Agent' },
  { agent: 'EvidenceAgent', label: '证据检索 Agent' },
  { agent: 'SyndromeAgent', label: '证候分析 Agent' },
  { agent: 'AnswerAgent', label: '回答生成 Agent' },
  { agent: 'SafetyAgent', label: '安全审查 Agent' },
]

const NODE_TO_AGENT: Readonly<Record<string, CollaborationAgent>> = {
  intent: 'IntentAgent',
  direct_response: 'IntentAgent',
  inquiry: 'InquiryAgent',
  prepare_clarification: 'InquiryAgent',
  wait_for_clarification: 'InquiryAgent',
  evidence: 'EvidenceAgent',
  syndrome: 'SyndromeAgent',
  answer_draft: 'AnswerAgent',
  answer_rewrite: 'AnswerAgent',
  safety_initial: 'SafetyAgent',
  safety_rewrite: 'SafetyAgent',
  safe_fallback: 'SafetyAgent',
}

const NODE_TO_TRACE_AGENTS: Readonly<Record<string, ReadonlyArray<CollaborationAgent>>> = {
  intent: ['IntentAgent'],
  direct_response: ['IntentAgent'],
  inquiry: ['InquiryAgent'],
  prepare_clarification: ['InquiryAgent'],
  wait_for_clarification: ['InquiryAgent'],
  evidence: ['EvidenceAgent'],
  syndrome: ['SyndromeAgent'],
  answer_draft: ['AnswerAgent'],
  answer_rewrite: ['AnswerAgent'],
  safety_initial: ['SafetyAgent'],
  safety_rewrite: ['SafetyAgent'],
  safe_fallback: ['AnswerAgent', 'SafetyAgent'],
}

const COLLABORATION_AGENTS = new Set<CollaborationAgent>(WORKFLOW_DEFINITIONS.map(({ agent }) => agent))

export function createWorkflowSteps(): CollaborationStep[] {
  return WORKFLOW_DEFINITIONS.map(({ agent, label }) => ({
    id: `agent:${agent}`,
    agent,
    label,
    status: 'pending',
    summary: '等待执行',
  }))
}

export function applyCollaborationSseEvent(
  current: ReadonlyArray<CollaborationStep>,
  event: TcmFlowSseEvent,
): CollaborationStep[] {
  let next = cloneSteps(current)
  const payload = readRootStreamPayload(event.data)
  if (!isRecord(payload)) {
    return next
  }

  if (event.event === 'tasks') {
    if (typeof payload.name !== 'string') {
      return next
    }

    const agent = hasOwn(NODE_TO_AGENT, payload.name) ? NODE_TO_AGENT[payload.name] : undefined
    if (!agent) {
      return next
    }
    if (hasOwn(payload, 'error') && payload.error !== null) {
      return updateStep(next, agent, { status: 'failed', summary: '执行失败' })
    }
    if (hasOwn(payload, 'input')) {
      return updateStep(next, agent, { status: 'running' })
    }
    return next
  }

  if (event.event !== 'updates') {
    return next
  }

  for (const [nodeName, update] of Object.entries(payload)) {
    if (!hasOwn(NODE_TO_TRACE_AGENTS, nodeName)) {
      continue
    }
    const allowedAgents = NODE_TO_TRACE_AGENTS[nodeName]
    if (!isRecord(update) || !Array.isArray(update.agent_trace)) {
      continue
    }

    for (const trace of update.agent_trace) {
      if (!isRecord(trace) || !isCollaborationAgent(trace.agent) || !allowedAgents.includes(trace.agent)) {
        continue
      }

      next = updateStep(next, trace.agent, {
        status: 'completed',
        summary: summarizeTrace(trace.agent, trace),
      })
    }
  }

  return next
}

export function finishCollaboration(
  current: ReadonlyArray<CollaborationStep>,
  outcome: 'completed' | 'failed',
): CollaborationStep[] {
  return current.map((step) => {
    if (step.status === 'completed') {
      return { ...step }
    }
    if (step.status === 'pending') {
      return { ...step, status: 'skipped' }
    }
    if (outcome === 'completed' && step.status === 'running') {
      return { ...step, status: 'skipped' }
    }
    if (outcome === 'failed' && step.status === 'running') {
      return { ...step, status: 'failed' }
    }
    return { ...step }
  })
}

export function restoreCollaborationFromTrace(trace: unknown): CollaborationStep[] {
  let restored = createWorkflowSteps()
  let hasCompletedTrace = false
  if (Array.isArray(trace)) {
    for (const entry of trace) {
      if (!isRecord(entry) || !isCollaborationAgent(entry.agent)) {
        continue
      }

      restored = updateStep(restored, entry.agent, {
        status: 'completed',
        summary: summarizeTrace(entry.agent, entry),
      })
      hasCompletedTrace = true
    }
  }

  return hasCompletedTrace ? finishCollaboration(restored, 'completed') : []
}

function summarizeTrace(agent: CollaborationAgent, trace: Record<string, unknown>): string {
  switch (agent) {
    case 'IntentAgent':
      return '已识别咨询意图并确定处理路线'
    case 'InquiryAgent':
      return trace.should_pause_for_clarification === true
        ? '已评估问诊信息，仍需补充关键情况'
        : '已完成问诊信息完整度评估'
    case 'EvidenceAgent':
      return typeof trace.evidence_count === 'number' && trace.evidence_count > 0
        ? `已完成中医证据检索，共获得 ${trace.evidence_count} 条相关依据`
        : '已完成中医证据检索，暂未获得充分依据'
    case 'SyndromeAgent':
      return '已完成证候候选分析'
    case 'AnswerAgent':
      return trace.stage === 'rewrite' ? '已根据安全审查完成回答修订' : '已生成本轮回答草稿'
    case 'SafetyAgent':
      return trace.rewrite_required === true
        ? '已完成安全审查，回答需要调整'
        : '已完成回答安全审查'
  }
}

function updateStep(
  steps: ReadonlyArray<CollaborationStep>,
  agent: CollaborationAgent,
  update: Pick<CollaborationStep, 'status'> & Partial<Pick<CollaborationStep, 'summary'>>,
): CollaborationStep[] {
  return steps.map((step) => (step.agent === agent ? { ...step, ...update } : { ...step }))
}

function cloneSteps(steps: ReadonlyArray<CollaborationStep>): CollaborationStep[] {
  return steps.map((step) => ({ ...step }))
}

function isCollaborationAgent(value: unknown): value is CollaborationAgent {
  return typeof value === 'string' && COLLABORATION_AGENTS.has(value as CollaborationAgent)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.hasOwn(value, key)
}
