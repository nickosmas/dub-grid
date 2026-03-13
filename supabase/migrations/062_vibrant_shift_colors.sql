-- Migration 062: Update shift code colors to vibrant, type-based palette
--
-- Strategy: shift TYPE owns the color, not the focus area.
-- D (day) = blue everywhere, E (evening) = amber, N (night) = violet.
-- When a shift code appears in a foreign focus area it renders as an
-- outline/ghost pill (white bg + colored border) — the color itself
-- stays consistent so the shift is always recognizable.
--
-- Color families:
--   Day    → blue   (#2563EB primary, darker variants for supervisor/CN)
--   Evening → amber  (#D97706 primary)
--   Night   → violet (#7C3AED primary)
--   Visiting→ cyan   (#0891B2)
--   Off     → slate  (keep muted — pills render as a dash, not a pill)
--   General → emerald/slate

-- ── Day shift codes (blue family) ────────────────────────────────────────────
UPDATE public.shift_codes SET
  color        = '#2563EB',
  border_color = '#1D4ED8',
  text_color   = '#FFFFFF'
WHERE label = 'D' AND name ILIKE 'Day%' AND is_off_day = false AND is_general = false;

UPDATE public.shift_codes SET
  color        = '#1D4ED8',
  border_color = '#1E40AF',
  text_color   = '#FFFFFF'
WHERE label = 'Ds' AND name ILIKE '%Supervisor%';

UPDATE public.shift_codes SET
  color        = '#1E40AF',
  border_color = '#1e3a8a',
  text_color   = '#FFFFFF'
WHERE label = 'Dcn';

UPDATE public.shift_codes SET
  color        = '#60A5FA',
  border_color = '#3B82F6',
  text_color   = '#1E3A8A'
WHERE label = '(D)';

-- ── Evening shift codes (amber family) ───────────────────────────────────────
UPDATE public.shift_codes SET
  color        = '#D97706',
  border_color = '#B45309',
  text_color   = '#FFFFFF'
WHERE label = 'E' AND name ILIKE 'Evening%' AND is_off_day = false AND is_general = false;

UPDATE public.shift_codes SET
  color        = '#B45309',
  border_color = '#92400E',
  text_color   = '#FFFFFF'
WHERE label = 'Es';

UPDATE public.shift_codes SET
  color        = '#F59E0B',
  border_color = '#D97706',
  text_color   = '#78350F'
WHERE label = 'Ecn';

-- ── Night shift codes (violet family) ────────────────────────────────────────
UPDATE public.shift_codes SET
  color        = '#7C3AED',
  border_color = '#6D28D9',
  text_color   = '#FFFFFF'
WHERE label = 'N' AND name ILIKE 'Night%';

UPDATE public.shift_codes SET
  color        = '#6D28D9',
  border_color = '#5B21B6',
  text_color   = '#FFFFFF'
WHERE label = 'Ns';

-- ── Visiting / specialty (cyan family) ───────────────────────────────────────
UPDATE public.shift_codes SET
  color        = '#0891B2',
  border_color = '#0E7490',
  text_color   = '#FFFFFF'
WHERE label = 'VN';

-- ── General/Off-day codes ─────────────────────────────────────────────────────
UPDATE public.shift_codes SET
  color        = '#F1F5F9',
  border_color = '#94A3B8',
  text_color   = '#475569'
WHERE label = 'X';

UPDATE public.shift_codes SET
  color        = '#10B981',
  border_color = '#059669',
  text_color   = '#FFFFFF'
WHERE label = 'Ofc';

UPDATE public.shift_codes SET
  color        = '#94A3B8',
  border_color = '#64748B',
  text_color   = '#FFFFFF'
WHERE label = '0.3';

-- ── Shift category tally-row backgrounds (light tints, not vivid) ────────────
-- Day categories → blue-100
UPDATE public.shift_categories SET color = '#DBEAFE' WHERE name ILIKE '%Day%';
-- Evening categories → amber-100
UPDATE public.shift_categories SET color = '#FEF3C7' WHERE name ILIKE '%Evening%';
-- Night categories → violet-100
UPDATE public.shift_categories SET color = '#EDE9FE' WHERE name ILIKE '%Night%';
-- Visiting categories → cyan-100
UPDATE public.shift_categories SET color = '#CFFAFE' WHERE name ILIKE '%Visit%';
