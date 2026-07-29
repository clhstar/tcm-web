type TraceRecord = Record<string, unknown>

export type CollaborationStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'failed'

export type CollaborationAgent =
  | 'CasePatchExtractor'
  | 'CaseMerger'
  | 'RiskGate'
  | 'CompletenessPolicy'
  | 'EvidenceAgent'
  | 'SyndromeAgent'
  | 'AnswerAgent'
  | 'SafetyAgent'
  | 'EvidenceBoundary'

export type CollaborationStep = {
  id: string
  agent: CollaborationAgent
  label: string
  status: CollaborationStatus
  summary: string
}

const LABELS: Readonly<Record<CollaborationAgent, string>> = {
  CasePatchExtractor: '病例事实提取',
  CaseMerger: '病例合并',
  RiskGate: '危险信号检查',
  CompletenessPolicy: '完整度检查',
  EvidenceAgent: '证据检索',
  SyndromeAgent: '证候候选分析',
  AnswerAgent: '回答生成',
  SafetyAgent: '安全审查',
  EvidenceBoundary: '无证据安全降级',
}
const AGENTS = new Set<CollaborationAgent>(
  Object.keys(LABELS) as CollaborationAgent[],
)

/**
 * 从已持久化的公开追踪摘要恢复展示步骤，不消费实时内部节点事件。
 */
export function restoreCollaborationFromTrace(trace: unknown): CollaborationStep[] {
  if (!Array.isArray(trace)) {
    return []
  }
  const steps: CollaborationStep[] = []
  const seen = new Set<CollaborationAgent>()
  for (const entry of trace) {
    if (!isRecord(entry) || !isCollaborationAgent(entry.agent) || seen.has(entry.agent)) {
      continue
    }
    seen.add(entry.agent)
    steps.push({
      id: `agent:${entry.agent}`,
      agent: entry.agent,
      label: LABELS[entry.agent],
      status: 'completed',
      summary: summarizeTrace(entry.agent, entry),
    })
  }
  return steps
}

/**
 * 把内部 reason code 转为不泄漏状态细节的用户可读执行摘要。
 */
function summarizeTrace(agent: CollaborationAgent, trace: TraceRecord): string {
  switch (agent) {
    case 'CasePatchExtractor':
      return '已提取本轮明确陈述的病例事实'
    case 'CaseMerger':
      return '已非破坏合并病例事实与来源'
    case 'RiskGate':
      return trace.urgent === true ? '已识别需要及时处理的危险信号' : '已完成危险信号检查'
    case 'CompletenessPolicy':
      return trace.action === 'clarify' ? '仍需补充关键情况' : '已完成信息完整度检查'
    case 'EvidenceAgent':
      return trace.quality === 'sufficient' ? '已获得可追溯证据' : '未获得充分可追溯证据'
    case 'SyndromeAgent':
      return '已完成证候候选分析'
    case 'AnswerAgent':
      return trace.stage === 'safe_fallback' ? '已生成保守安全答复' : '已生成回答草稿'
    case 'SafetyAgent':
      return trace.rewrite_required === true ? '安全审查要求调整回答' : '已完成回答安全审查'
    case 'EvidenceBoundary':
      return '已明确说明证据不足并安全降级'
  }
}

/** 判断追踪条目是否为普通对象，拒绝数组与空值。 */
function isRecord(value: unknown): value is TraceRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 仅接受新版问诊允许公开展示的 Agent 名称。 */
function isCollaborationAgent(value: unknown): value is CollaborationAgent {
  return typeof value === 'string' && AGENTS.has(value as CollaborationAgent)
}
