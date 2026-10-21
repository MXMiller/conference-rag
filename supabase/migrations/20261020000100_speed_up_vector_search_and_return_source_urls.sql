-- match_sentences() needs to return source URLs for semantic and RAG result links.
DROP FUNCTION IF EXISTS public.match_sentences(vector, integer);

CREATE FUNCTION public.match_sentences(
  query_embedding vector(1536),
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  talk_id uuid,
  title text,
  speaker text,
  url text,
  text text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    sentence_embeddings.id,
    sentence_embeddings.talk_id,
    sentence_embeddings.title,
    sentence_embeddings.speaker,
    sentence_embeddings.url,
    sentence_embeddings.text,
    1 - (sentence_embeddings.embedding <=> query_embedding) AS similarity
  FROM public.sentence_embeddings
  ORDER BY sentence_embeddings.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- IVFFlat builds faster and uses less memory than HNSW for this dataset size.
-- The default maintenance_work_mem (32 MB on this project) is below the
-- 61 MB required for this index build. This setting applies to this session.
SET maintenance_work_mem = '128MB';

CREATE INDEX IF NOT EXISTS sentence_embeddings_embedding_ivfflat_idx
ON public.sentence_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 26);

RESET maintenance_work_mem;

ANALYZE public.sentence_embeddings;

GRANT EXECUTE ON FUNCTION public.match_sentences(vector, integer) TO authenticated;
