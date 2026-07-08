import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryTcmFlow } from './tcmFlow'

const retrievalResponse = {
  status: 'ok',
  retrieval_mode: 'hybrid_parent',
  degraded: false,
  degraded_reason: null,
  original_query: '头痛恶风',
  rewritten_query: '头痛恶风 头痛 头风',
  chief_symptom: '头痛',
  allowed_terms: ['头痛'],
  formatted_text: '检索状态：ok\n\n[E1]\n原文：头痛恶风，遇冷加重。',
  results: [
    {
      citation_id: 'E1',
      parent_id: 'p1',
      chunk_id: 'c1',
      book_title: '景岳全书',
      volume: '卷之一',
      chapter: '头痛',
      section: '头痛论',
      content: '头痛恶风，遇冷加重。',
      matched_child: '头痛恶风',
      evidence_role: 'syndrome_pattern',
      symptom_tags: ['头痛'],
      score: 0.9,
      retrieval_sources: ['bm25', 'dense'],
      bm25_rank: 1,
      dense_rank: 1,
    },
  ],
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('tcm-flow API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('queries tcm-flow with normalized input and parses evidence results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(retrievalResponse))
    vi.stubGlobal('fetch', fetchMock)

    await expect(queryTcmFlow({ query: '  头痛恶风  ', topK: 3 })).resolves.toEqual(retrievalResponse)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2027/api/rag/query',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          query: '头痛恶风',
          top_k: 3,
          mode: 'hybrid',
        }),
      }),
    )
  })
})
