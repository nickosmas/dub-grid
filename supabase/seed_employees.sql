-- =============================================================================
-- Seed: employees
-- Org: Arden Wood (dae224d9-4125-4dba-be4d-b8b27149f846)
--
-- Run after schema / full_setup.sql has been applied.
-- Safe to re-run — uses ON CONFLICT DO NOTHING.
-- =============================================================================

DO $$
DECLARE
  org uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
BEGIN

  INSERT INTO public.employees
    (org_id, name, designation, roles, fte_weight, seniority, wings)
  VALUES
    -- Skilled Nursing Wing ────────────────────────────────────────────────────
    (org, 'Connie Wahl',           'JLCSN',   ARRAY['DCSN'],                        1.0,  1, ARRAY['Skilled Nursing Wing']),
    (org, 'Robert Miruka',         'JLCSN',   ARRAY['Mentor'],                      1.0,  2, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Rose Keyaer',           'JLCSN',   ARRAY['Supv'],                        1.0,  3, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Shirley Bihag',         'JLCSN',   ARRAY['Supv'],                        1.0,  4, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Queen Nwosu',           'JLCSN',   ARRAY['Mentor', 'Supv'],              1.0,  5, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Ben Egwuenu',           'JLCSN',   ARRAY['Supv'],                        1.0,  6, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Linda Luciani',         'JLCSN',   ARRAY['Supv', 'CN'],                  1.0,  7, ARRAY['Skilled Nursing Wing', 'Visiting CSNS', 'Sheltered Care']),
    (org, 'Paul Otieno',           'JLCSN',   ARRAY['Supv'],                        1.0,  8, ARRAY['Skilled Nursing Wing']),
    (org, 'Julius Miruka',         'JLCSN',   ARRAY['Supv'],                        1.0,  9, ARRAY['Skilled Nursing Wing', 'Night Shift']),
    (org, 'Becky Hoskyn',          'JLCSN',   ARRAY[]::text[],                      1.0, 10, ARRAY['Skilled Nursing Wing']),
    (org, 'Jared Onsabwa',         'STAFF',   ARRAY[]::text[],                      1.0, 11, ARRAY['Skilled Nursing Wing']),
    (org, 'Emmanuel Odenyi',       'STAFF',   ARRAY[]::text[],                      1.0, 12, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Nicodamus Kosmas',      'STAFF',   ARRAY[]::text[],                      1.0, 13, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Josiah "Joey" Onyechi', 'STAFF',   ARRAY[]::text[],                      1.0, 14, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Alice Mburu',           'STAFF',   ARRAY[]::text[],                      1.0, 15, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Alayne Reed',           'STAFF',   ARRAY[]::text[],                      1.0, 16, ARRAY['Skilled Nursing Wing']),
    (org, 'Chris Michael Mawere',  'CSN III', ARRAY[]::text[],                      1.0, 17, ARRAY['Skilled Nursing Wing', 'Visiting CSNS', 'Sheltered Care']),
    (org, 'Daniel Ogbonna',        'CSN III', ARRAY[]::text[],                      1.0, 18, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Alphince Baraza',       'CSN III', ARRAY[]::text[],                      1.0, 19, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Arphaxard Ouma',        'CSN II',  ARRAY[]::text[],                      1.0, 20, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Mercy Kigera',          'CSN II',  ARRAY[]::text[],                      1.0, 21, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Vicky Kiende',          'CSN II',  ARRAY[]::text[],                      1.0, 22, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Deborah Lee',           'JLCSN',   ARRAY['SC. Mgr.'],                    1.0, 23, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Sherry Otieno',         '—',       ARRAY['Activity Coordinator'],        1.0, 24, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    (org, 'Deborah Gray',          '—',       ARRAY['SC/Asst/Act/Cor'],             0.3, 25, ARRAY['Skilled Nursing Wing', 'Sheltered Care']),
    -- Night Shift ─────────────────────────────────────────────────────────────
    (org, 'Grace Kamiti',          'JLCSN',   ARRAY['Supv'],                        1.0, 26, ARRAY['Night Shift']),
    (org, 'Stephen Onsabwa',       'JLCSN',   ARRAY['Supv'],                        1.0, 27, ARRAY['Night Shift']),
    -- Visiting CSNS ───────────────────────────────────────────────────────────
    (org, 'Aicha Langel',          'JLCSN',   ARRAY['DVCSN'],                       1.0, 28, ARRAY['Visiting CSNS'])
  ON CONFLICT (org_id, name) DO NOTHING;

END $$;
