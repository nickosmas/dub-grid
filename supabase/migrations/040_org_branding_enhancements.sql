-- ============================================================
-- Add branding and configuration to organizations
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url            TEXT,
  ADD COLUMN IF NOT EXISTS app_name            TEXT DEFAULT 'DubGrid',
  ADD COLUMN IF NOT EXISTS meta_description    TEXT DEFAULT 'Smart staff scheduling for care facilities',
  ADD COLUMN IF NOT EXISTS theme_config        JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_page_config JSONB DEFAULT '{}'::jsonb;

-- Comment on columns for clarity
COMMENT ON COLUMN public.organizations.logo_url IS 'URL to the organization custom logo image';
COMMENT ON COLUMN public.organizations.app_name IS 'Custom display name for the application';
COMMENT ON COLUMN public.organizations.meta_description IS 'Custom SEO meta description';
COMMENT ON COLUMN public.organizations.theme_config IS 'JSON object containing primary_color, accent_color, etc.';
COMMENT ON COLUMN public.organizations.landing_page_config IS 'JSON object containing hero_title, features, and pain_points';
