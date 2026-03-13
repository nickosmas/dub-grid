-- =============================================================================
-- Seed: certifications, company_roles, and employees
-- Company: Arden Wood (dae224d9-4125-4dba-be4d-b8b27149f846)
--
-- Run after arden_admin_seed.sql (which creates the company + focus areas).
-- Safe to re-run — uses ON CONFLICT DO NOTHING.
-- =============================================================================

DO $$
DECLARE
  company uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
  -- Certification IDs
  cert_jlcsn  bigint;
  cert_staff  bigint;
  cert_csn3   bigint;
  cert_csn2   bigint;
  cert_other  bigint;
  -- Role IDs
  role_dcsn   bigint;
  role_dvcsn  bigint;
  role_supv   bigint;
  role_mentor bigint;
  role_cn     bigint;
  role_scmgr  bigint;
  role_actcor bigint;
  role_scasst bigint;
  -- Focus Area IDs
  fa_snw  integer;
  fa_sc   integer;
  fa_ns   integer;
  fa_vcsn integer;
BEGIN

  -- ── Certifications ──────────────────────────────────────────────────────────
  INSERT INTO public.certifications (company_id, name, abbr, sort_order)
  VALUES
    (company, 'Junior Licensed Clinical Specialist Nurse',   'JLCSN',   0),
    (company, 'Certified Skilled Nurse III',  'CSN III', 1),
    (company, 'Certified Skilled Nurse II',   'CSN II',  2),
    (company, 'Staff Nurse',    'STAFF',   3),
    (company, 'Other',    '—',       4)
  ON CONFLICT (company_id, name) WHERE archived_at IS NULL DO NOTHING;

  SELECT id INTO cert_jlcsn FROM public.certifications WHERE company_id = company AND name = 'Junior Licensed Clinical Specialist Nurse';
  SELECT id INTO cert_csn3  FROM public.certifications WHERE company_id = company AND name = 'Certified Skilled Nurse III';
  SELECT id INTO cert_csn2  FROM public.certifications WHERE company_id = company AND name = 'Certified Skilled Nurse II';
  SELECT id INTO cert_staff FROM public.certifications WHERE company_id = company AND name = 'Staff Nurse';
  SELECT id INTO cert_other FROM public.certifications WHERE company_id = company AND name = 'Other';

  -- ── Company Roles ───────────────────────────────────────────────────────────
  INSERT INTO public.company_roles (company_id, name, abbr, sort_order)
  VALUES
    (company, 'DCSN',                  'DCSN',    0),
    (company, 'DVCSN',                 'DVCSN',   1),
    (company, 'Supv',                  'Supv',    2),
    (company, 'Mentor',                'Mentor',  3),
    (company, 'CN',                    'CN',      4),
    (company, 'SC. Mgr.',             'SC Mgr',  5),
    (company, 'Activity Coordinator',  'Act Cor', 6),
    (company, 'SC/Asst/Act/Cor',       'SC/A/AC', 7)
  ON CONFLICT (company_id, name) WHERE archived_at IS NULL DO NOTHING;

  SELECT id INTO role_dcsn   FROM public.company_roles WHERE company_id = company AND name = 'DCSN';
  SELECT id INTO role_dvcsn  FROM public.company_roles WHERE company_id = company AND name = 'DVCSN';
  SELECT id INTO role_supv   FROM public.company_roles WHERE company_id = company AND name = 'Supv';
  SELECT id INTO role_mentor FROM public.company_roles WHERE company_id = company AND name = 'Mentor';
  SELECT id INTO role_cn     FROM public.company_roles WHERE company_id = company AND name = 'CN';
  SELECT id INTO role_scmgr  FROM public.company_roles WHERE company_id = company AND name = 'SC. Mgr.';
  SELECT id INTO role_actcor FROM public.company_roles WHERE company_id = company AND name = 'Activity Coordinator';
  SELECT id INTO role_scasst FROM public.company_roles WHERE company_id = company AND name = 'SC/Asst/Act/Cor';

  -- ── Focus Area IDs ──────────────────────────────────────────────────────────
  SELECT id INTO fa_snw  FROM public.focus_areas WHERE company_id = company AND name = 'Skilled Nursing';
  SELECT id INTO fa_sc   FROM public.focus_areas WHERE company_id = company AND name = 'Sheltered Care';
  SELECT id INTO fa_ns   FROM public.focus_areas WHERE company_id = company AND name = 'Night Shift';
  SELECT id INTO fa_vcsn FROM public.focus_areas WHERE company_id = company AND name = 'Visiting CSNS';

  -- ── Employees ───────────────────────────────────────────────────────────────
  INSERT INTO public.employees
    (company_id, name, certification_id, role_ids, seniority, focus_area_ids)
  VALUES
    -- Skilled Nursing ────────────────────────────────────────────────────
    (company, 'Connie Wahl',           cert_jlcsn, ARRAY[role_dcsn],                      1, ARRAY[fa_snw]),
    (company, 'Robert Miruka',         cert_jlcsn, ARRAY[role_mentor],                    2, ARRAY[fa_snw, fa_sc]),
    (company, 'Rose Keyaer',           cert_jlcsn, ARRAY[role_supv],                      3, ARRAY[fa_snw, fa_sc]),
    (company, 'Shirley Bihag',         cert_jlcsn, ARRAY[role_supv],                      4, ARRAY[fa_snw, fa_sc]),
    (company, 'Queen Nwosu',           cert_jlcsn, ARRAY[role_mentor, role_supv],          5, ARRAY[fa_snw, fa_sc]),
    (company, 'Ben Egwuenu',           cert_jlcsn, ARRAY[role_supv],                      6, ARRAY[fa_snw, fa_sc]),
    (company, 'Linda Luciani',         cert_jlcsn, ARRAY[role_supv, role_cn],              7, ARRAY[fa_snw, fa_vcsn, fa_sc]),
    (company, 'Paul Otieno',           cert_jlcsn, ARRAY[role_supv],                      8, ARRAY[fa_snw]),
    (company, 'Julius Miruka',         cert_jlcsn, ARRAY[role_supv],                      9, ARRAY[fa_snw, fa_ns]),
    (company, 'Becky Hoskyn',          cert_jlcsn, ARRAY[]::bigint[],                    10, ARRAY[fa_snw]),
    (company, 'Jared Onsabwa',         cert_staff, ARRAY[]::bigint[],                    11, ARRAY[fa_snw]),
    (company, 'Emmanuel Odenyi',       cert_staff, ARRAY[]::bigint[],                    12, ARRAY[fa_snw, fa_sc]),
    (company, 'Nicodamus Kosmas',      cert_staff, ARRAY[]::bigint[],                    13, ARRAY[fa_snw, fa_sc]),
    (company, 'Josiah "Joey" Onyechi', cert_staff, ARRAY[]::bigint[],                    14, ARRAY[fa_snw, fa_sc]),
    (company, 'Alice Mburu',           cert_staff, ARRAY[]::bigint[],                    15, ARRAY[fa_snw, fa_sc]),
    (company, 'Alayne Reed',           cert_staff, ARRAY[]::bigint[],                    16, ARRAY[fa_snw]),
    (company, 'Chris Michael Mawere',  cert_csn3,  ARRAY[]::bigint[],                    17, ARRAY[fa_snw, fa_vcsn, fa_sc]),
    (company, 'Daniel Ogbonna',        cert_csn3,  ARRAY[]::bigint[],                    18, ARRAY[fa_snw, fa_sc]),
    (company, 'Alphince Baraza',       cert_csn3,  ARRAY[]::bigint[],                    19, ARRAY[fa_snw, fa_sc]),
    (company, 'Arphaxard Ouma',        cert_csn2,  ARRAY[]::bigint[],                    20, ARRAY[fa_snw, fa_sc]),
    (company, 'Mercy Kigera',          cert_csn2,  ARRAY[]::bigint[],                    21, ARRAY[fa_snw, fa_sc]),
    (company, 'Vicky Kiende',          cert_csn2,  ARRAY[]::bigint[],                    22, ARRAY[fa_snw, fa_sc]),
    (company, 'Deborah Lee',           cert_jlcsn, ARRAY[role_scmgr],                    23, ARRAY[fa_snw, fa_sc]),
    (company, 'Sherry Otieno',         cert_other, ARRAY[role_actcor],                   24, ARRAY[fa_snw, fa_sc]),
    (company, 'Deborah Gray',          cert_other, ARRAY[role_scasst],                   25, ARRAY[fa_snw, fa_sc]),
    -- Night Shift ─────────────────────────────────────────────────────────────
    (company, 'Grace Kamiti',          cert_jlcsn, ARRAY[role_supv],                     26, ARRAY[fa_ns]),
    (company, 'Stephen Onsabwa',       cert_jlcsn, ARRAY[role_supv],                     27, ARRAY[fa_ns]),
    -- Visiting CSNS ───────────────────────────────────────────────────────────
    (company, 'Aicha Langel',          cert_jlcsn, ARRAY[role_dvcsn],                    28, ARRAY[fa_vcsn])
  ON CONFLICT (company_id, name) WHERE archived_at IS NULL DO NOTHING;

END $$;
