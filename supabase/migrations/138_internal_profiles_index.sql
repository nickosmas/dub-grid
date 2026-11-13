-- 138: Index the internal accounts.
--
-- Most schedule and people reads first look up which profiles are internal
-- (081) to hide them, and that lookup scanned every profile on the platform.
-- Internal accounts are a handful, so a partial index keeps the read small.

CREATE INDEX IF NOT EXISTS idx_profiles_internal
  ON public.profiles (id)
  WHERE is_internal;
