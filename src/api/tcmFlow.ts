import { z } from 'zod'
import { TCM_FLOW_BASE_URL } from '../config/global'
import { requestJson } from '../shared/api/httpClient'

const REQUEST_FALLBACK_MESSAGE = 'tcm-flow request failed, please make sure the service is running.'

const evidenceSchema = z.object({
  citation_id: z.string(),
  parent_id: z.string(),
  chunk_id: z.string(),
  book_title: z.string().nullable().optional(),
  volume: z.string().nullable().optional(),
  chapter: z.string().nullable().optional(),
  section: z.string().nullable().optional(),
  content: z.string(),
  matched_child: z.string().nullable().optional(),
  evidence_role: z.string().nullable().optional(),
  symptom_tags: z.array(z.string()).default([]),
  score: z.number().nullable().optional(),
  retrieval_sources: z.array(z.string()).default([]),
  bm25_rank: z.number().nullable().optional(),
  dense_rank: z.number().nullable().optional(),
})

const tcmFlowResponseSchema = z.object({
  status: z.string(),
  retrieval_mode: z.string(),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable().optional(),
  original_query: z.string(),
  rewritten_query: z.string(),
  chief_symptom: z.string().nullable().optional(),
  allowed_terms: z.array(z.string()).default([]),
  formatted_text: z.string(),
  results: z.array(evidenceSchema),
})

export type TcmFlowEvidence = z.infer<typeof evidenceSchema>
export type TcmFlowRetrieval = z.infer<typeof tcmFlowResponseSchema>

type QueryTcmFlowInput = {
  query: string
  topK?: number
  mode?: 'hybrid' | 'vector' | 'keyword'
}

export async function queryTcmFlow(input: QueryTcmFlowInput): Promise<TcmFlowRetrieval> {
  const normalizedQuery = input.query.trim()
  const payload = await requestJson('/api/rag/query', {
    method: 'POST',
    body: JSON.stringify({
      query: normalizedQuery,
      top_k: input.topK ?? 5,
      mode: input.mode ?? 'hybrid',
    }),
  }, {
    authenticated: false,
    baseUrl: TCM_FLOW_BASE_URL,
    errorKeys: ['detail', 'message'],
    fallbackMessage: REQUEST_FALLBACK_MESSAGE,
  })

  return tcmFlowResponseSchema.parse(payload)
}
