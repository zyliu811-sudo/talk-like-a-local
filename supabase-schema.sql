-- 在 Supabase SQL Editor 里运行这段代码

CREATE TABLE sentences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  english     TEXT NOT NULL,
  chinese     TEXT NOT NULL,
  source      JSONB DEFAULT '{"url":"","timestamp":""}',
  keywords    JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  sr          JSONB NOT NULL DEFAULT '{"interval":1,"easeFactor":2.5,"dueDate":"","repetitions":0,"lapses":0}'
);

-- 每个用户只能看到自己的句子
ALTER TABLE sentences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_sentences" ON sentences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
