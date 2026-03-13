-- =============================================================================
-- Seed: shifts  (March 8–21, 2026)
-- Company: Arden Wood (dae224d9-4125-4dba-be4d-b8b27149f846)
--
-- Run AFTER seed_employees.sql (which creates certifications, roles, employees).
-- Looks up emp_id by name and shift_code by label + focus_area_id.
-- Safe to re-run — ON CONFLICT updates published_shift_code_ids + focus_area_id.
-- =============================================================================

DO $$
DECLARE
  company  uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
  -- Focus area IDs
  snw  integer;
  sc   integer;
  ns   integer;
  vc   integer;
  -- Shift code IDs (global)
  c_x    integer;  -- Off
  c_ofc  integer;  -- Office
  c_03   integer;  -- Partial (0.3)
  -- SNW codes
  c_d_snw    integer;
  c_ds_snw   integer;
  c_dcn_snw  integer;
  c_fd_snw   integer;  -- (D) float
  c_e_snw    integer;
  c_es_snw   integer;
  c_ecn_snw  integer;
  -- SC codes
  c_d_sc     integer;
  c_dcn_sc   integer;
  c_e_sc     integer;
  c_ecn_sc   integer;
  -- Night codes
  c_n        integer;
  c_ns       integer;
  -- Visiting codes
  c_vn       integer;
BEGIN
  -- Focus areas
  SELECT id INTO snw FROM public.focus_areas WHERE company_id = company AND name = 'Skilled Nursing';
  SELECT id INTO sc  FROM public.focus_areas WHERE company_id = company AND name = 'Sheltered Care';
  SELECT id INTO ns  FROM public.focus_areas WHERE company_id = company AND name = 'Night Shift';
  SELECT id INTO vc  FROM public.focus_areas WHERE company_id = company AND name = 'Visiting CSNS';

  -- Global codes
  SELECT id INTO c_x   FROM public.shift_codes WHERE company_id = company AND label = 'X'   AND focus_area_id IS NULL;
  SELECT id INTO c_ofc FROM public.shift_codes WHERE company_id = company AND label = 'Ofc' AND focus_area_id IS NULL;
  SELECT id INTO c_03  FROM public.shift_codes WHERE company_id = company AND label = '0.3' AND focus_area_id IS NULL;

  -- SNW codes
  SELECT id INTO c_d_snw   FROM public.shift_codes WHERE company_id = company AND label = 'D'   AND focus_area_id = snw;
  SELECT id INTO c_ds_snw  FROM public.shift_codes WHERE company_id = company AND label = 'Ds'  AND focus_area_id = snw;
  SELECT id INTO c_dcn_snw FROM public.shift_codes WHERE company_id = company AND label = 'Dcn' AND focus_area_id = snw;
  SELECT id INTO c_fd_snw  FROM public.shift_codes WHERE company_id = company AND label = '(D)' AND focus_area_id = snw;
  SELECT id INTO c_e_snw   FROM public.shift_codes WHERE company_id = company AND label = 'E'   AND focus_area_id = snw;
  SELECT id INTO c_es_snw  FROM public.shift_codes WHERE company_id = company AND label = 'Es'  AND focus_area_id = snw;
  SELECT id INTO c_ecn_snw FROM public.shift_codes WHERE company_id = company AND label = 'Ecn' AND focus_area_id = snw;

  -- SC codes
  SELECT id INTO c_d_sc   FROM public.shift_codes WHERE company_id = company AND label = 'D'   AND focus_area_id = sc;
  SELECT id INTO c_dcn_sc FROM public.shift_codes WHERE company_id = company AND label = 'Dcn' AND focus_area_id = sc;
  SELECT id INTO c_e_sc   FROM public.shift_codes WHERE company_id = company AND label = 'E'   AND focus_area_id = sc;
  SELECT id INTO c_ecn_sc FROM public.shift_codes WHERE company_id = company AND label = 'Ecn' AND focus_area_id = sc;

  -- Night codes
  SELECT id INTO c_n  FROM public.shift_codes WHERE company_id = company AND label = 'N'  AND focus_area_id = ns;
  SELECT id INTO c_ns FROM public.shift_codes WHERE company_id = company AND label = 'Ns' AND focus_area_id = ns;

  -- Visiting codes
  SELECT id INTO c_vn FROM public.shift_codes WHERE company_id = company AND label = 'VN' AND focus_area_id = vc;

  -- ── Insert shifts ──────────────────────────────────────────────────────────
  -- v: (emp_name, date, code_ids int[], focus_area_id, custom_start, custom_end)
  INSERT INTO public.shifts (emp_id, date, published_shift_code_ids, company_id, focus_area_id, custom_start_time, custom_end_time)
  SELECT e.id, v.dt::date, v.codes, company, v.fa_id, v.cstart::time, v.cend::time
  FROM (VALUES

    -- Connie Wahl ─────────────────────────────────────────────────────────────
    ('Connie Wahl'::text, '2026-03-08'::date, ARRAY[c_x],   NULL::integer, NULL::text, NULL::text),
    ('Connie Wahl',       '2026-03-09', ARRAY[c_x],   NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-10', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-11', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-12', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-13', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-14', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-15', ARRAY[c_x],   NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-16', ARRAY[c_x],   NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-17', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-18', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-19', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-20', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-21', ARRAY[c_ofc], NULL, NULL, NULL),

    -- Deborah Lee (SC. Mgr.) ─────────────────────────────────────────────────
    ('Deborah Lee', '2026-03-08', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-09', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-10', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-11', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-12', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-13', ARRAY[c_x],      NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-14', ARRAY[c_x],      NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-15', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-16', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-17', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-18', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-19', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-20', ARRAY[c_x],      NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-21', ARRAY[c_x],      NULL, NULL, NULL),

    -- Robert Miruka ───────────────────────────────────────────────────────────
    ('Robert Miruka', '2026-03-08', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-09', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-10', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-11', ARRAY[c_x],      NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-12', ARRAY[c_x],      NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-13', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-14', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-15', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-16', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-17', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-18', ARRAY[c_x],      NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-19', ARRAY[c_x],      NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-20', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-21', ARRAY[c_fd_snw], snw,  NULL, NULL),

    -- Rose Keyaer ─────────────────────────────────────────────────────────────
    ('Rose Keyaer', '2026-03-08', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-09', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-10', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-11', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-12', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-13', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-14', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Rose Keyaer', '2026-03-15', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-16', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-17', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-18', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-19', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Rose Keyaer', '2026-03-20', ARRAY[c_e_snw],  snw,  '18:00', '00:00'),
    ('Rose Keyaer', '2026-03-21', ARRAY[c_ds_snw], snw,  NULL, NULL),

    -- Shirley Bihag ───────────────────────────────────────────────────────────
    ('Shirley Bihag', '2026-03-08', ARRAY[c_x],      NULL, NULL, NULL),
    ('Shirley Bihag', '2026-03-09', ARRAY[c_x],      NULL, NULL, NULL),
    ('Shirley Bihag', '2026-03-10', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Shirley Bihag', '2026-03-11', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-12', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-13', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-14', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-15', ARRAY[c_x],      NULL, NULL, NULL),
    ('Shirley Bihag', '2026-03-16', ARRAY[c_x],      NULL, NULL, NULL),
    ('Shirley Bihag', '2026-03-17', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Shirley Bihag', '2026-03-18', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-19', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-20', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-21', ARRAY[c_dcn_sc], sc,   NULL, NULL),

    -- Queen Nwosu ─────────────────────────────────────────────────────────────
    ('Queen Nwosu', '2026-03-08', ARRAY[c_x],      NULL, NULL, NULL),
    ('Queen Nwosu', '2026-03-09', ARRAY[c_x],      NULL, NULL, NULL),
    ('Queen Nwosu', '2026-03-10', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Queen Nwosu', '2026-03-11', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Queen Nwosu', '2026-03-12', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Queen Nwosu', '2026-03-13', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Queen Nwosu', '2026-03-14', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Queen Nwosu', '2026-03-15', ARRAY[c_x],      NULL, NULL, NULL),
    ('Queen Nwosu', '2026-03-16', ARRAY[c_x],      NULL, NULL, NULL),
    ('Queen Nwosu', '2026-03-17', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Queen Nwosu', '2026-03-18', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Queen Nwosu', '2026-03-19', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Queen Nwosu', '2026-03-20', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Queen Nwosu', '2026-03-21', ARRAY[c_es_snw], snw,  NULL, NULL),

    -- Ben Egwuenu ─────────────────────────────────────────────────────────────
    ('Ben Egwuenu', '2026-03-08', ARRAY[c_x],      NULL, NULL, NULL),
    ('Ben Egwuenu', '2026-03-09', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-10', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-11', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-12', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-13', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-14', ARRAY[c_x],      NULL, NULL, NULL),
    ('Ben Egwuenu', '2026-03-15', ARRAY[c_x],      NULL, NULL, NULL),
    ('Ben Egwuenu', '2026-03-16', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-17', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-18', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-19', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-20', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-21', ARRAY[c_x],      NULL, NULL, NULL),

    -- Linda Luciani ───────────────────────────────────────────────────────────
    ('Linda Luciani', '2026-03-08', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-09', ARRAY[c_x],      NULL, NULL, NULL),
    ('Linda Luciani', '2026-03-10', ARRAY[c_x],      NULL, NULL, NULL),
    ('Linda Luciani', '2026-03-11', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-12', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-13', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Linda Luciani', '2026-03-14', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Linda Luciani', '2026-03-15', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-16', ARRAY[c_x],      NULL, NULL, NULL),
    ('Linda Luciani', '2026-03-17', ARRAY[c_x],      NULL, NULL, NULL),
    ('Linda Luciani', '2026-03-18', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-19', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-20', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Linda Luciani', '2026-03-21', ARRAY[c_vn],     vc,   NULL, NULL),

    -- Paul Otieno ─────────────────────────────────────────────────────────────
    ('Paul Otieno', '2026-03-08', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-09', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-10', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-11', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-12', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-13', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-14', ARRAY[c_x],      NULL, NULL, NULL),
    ('Paul Otieno', '2026-03-15', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-16', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-17', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-18', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-19', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-20', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-21', ARRAY[c_x],      NULL, NULL, NULL),

    -- Julius Miruka (Night + Evening combos) ─────────────────────────────────
    ('Julius Miruka', '2026-03-08', ARRAY[c_n],          ns,   NULL, NULL),
    ('Julius Miruka', '2026-03-09', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-10', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-11', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-12', ARRAY[c_e_snw, c_ns], ns,  NULL, NULL),
    ('Julius Miruka', '2026-03-13', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Julius Miruka', '2026-03-14', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Julius Miruka', '2026-03-15', ARRAY[c_n],          ns,   NULL, NULL),
    ('Julius Miruka', '2026-03-16', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-17', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-18', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-19', ARRAY[c_e_snw, c_ns], ns,  NULL, NULL),
    ('Julius Miruka', '2026-03-20', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Julius Miruka', '2026-03-21', ARRAY[c_n],          ns,   NULL, NULL),

    -- Becky Hoskyn ────────────────────────────────────────────────────────────
    ('Becky Hoskyn', '2026-03-08', ARRAY[c_x],     NULL, NULL, NULL),
    ('Becky Hoskyn', '2026-03-09', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-10', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-11', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-12', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-13', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-14', ARRAY[c_x],     NULL, NULL, NULL),

    -- Jared Onsabwa ───────────────────────────────────────────────────────────
    ('Jared Onsabwa', '2026-03-08', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-09', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-10', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Jared Onsabwa', '2026-03-11', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Jared Onsabwa', '2026-03-12', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-13', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-14', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-15', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-16', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-17', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Jared Onsabwa', '2026-03-18', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Jared Onsabwa', '2026-03-19', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-20', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-21', ARRAY[c_x],     NULL, NULL, NULL),

    -- Emmanuel Odenyi (all SC Evening) ────────────────────────────────────────
    ('Emmanuel Odenyi', '2026-03-08', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-09', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-10', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-11', ARRAY[c_x],    NULL, NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-12', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-13', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-14', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-15', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-16', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-17', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-18', ARRAY[c_x],    NULL, NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-19', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-20', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-21', ARRAY[c_x],    NULL, NULL, NULL),

    -- Nicodamus Kosmas ────────────────────────────────────────────────────────
    ('Nicodamus Kosmas', '2026-03-08', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-09', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-10', ARRAY[c_x],      NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-11', ARRAY[c_x],      NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-12', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-13', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-14', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-15', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-16', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-17', ARRAY[c_x],      NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-18', ARRAY[c_x],      NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-19', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-20', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-21', ARRAY[c_e_snw],  snw,  NULL, NULL),

    -- Josiah "Joey" Onyechi ───────────────────────────────────────────────────
    ('Josiah "Joey" Onyechi', '2026-03-08', ARRAY[c_x],     NULL, NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-09', ARRAY[c_x],     NULL, NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-10', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-11', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-12', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-13', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-14', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-15', ARRAY[c_x],     NULL, NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-16', ARRAY[c_x],     NULL, NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-17', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-18', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-19', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-20', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-21', ARRAY[c_d_snw], snw,  NULL, NULL),

    -- Alice Mburu ─────────────────────────────────────────────────────────────
    ('Alice Mburu', '2026-03-08', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-09', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Alice Mburu', '2026-03-10', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-11', ARRAY[c_e_sc],   sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-12', ARRAY[c_x],      NULL, NULL, NULL),
    ('Alice Mburu', '2026-03-13', ARRAY[c_x],      NULL, NULL, NULL),
    ('Alice Mburu', '2026-03-14', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Alice Mburu', '2026-03-15', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-16', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Alice Mburu', '2026-03-17', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-18', ARRAY[c_e_sc],   sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-19', ARRAY[c_x],      NULL, NULL, NULL),
    ('Alice Mburu', '2026-03-20', ARRAY[c_x],      NULL, NULL, NULL),
    ('Alice Mburu', '2026-03-21', ARRAY[c_ecn_sc], sc,   NULL, NULL),

    -- Alayne Reed ─────────────────────────────────────────────────────────────
    ('Alayne Reed', '2026-03-08', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-09', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-10', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alayne Reed', '2026-03-11', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alayne Reed', '2026-03-12', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-13', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-14', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-15', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-16', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-17', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alayne Reed', '2026-03-18', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alayne Reed', '2026-03-19', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-20', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-21', ARRAY[c_e_snw], snw,  NULL, NULL),

    -- Chris Michael Mawere ────────────────────────────────────────────────────
    ('Chris Michael Mawere', '2026-03-08', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-09', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-10', ARRAY[c_vn],    vc,   NULL, NULL),
    ('Chris Michael Mawere', '2026-03-11', ARRAY[c_vn],    vc,   NULL, NULL),
    ('Chris Michael Mawere', '2026-03-12', ARRAY[c_vn],    vc,   NULL, NULL),
    ('Chris Michael Mawere', '2026-03-13', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-14', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-15', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-16', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-17', ARRAY[c_vn],    vc,   NULL, NULL),
    ('Chris Michael Mawere', '2026-03-18', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Chris Michael Mawere', '2026-03-19', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Chris Michael Mawere', '2026-03-20', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-21', ARRAY[c_x],     NULL, NULL, NULL),

    -- Daniel Ogbonna ──────────────────────────────────────────────────────────
    ('Daniel Ogbonna', '2026-03-08', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-03-09', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Daniel Ogbonna', '2026-03-10', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Daniel Ogbonna', '2026-03-11', ARRAY[c_x],     NULL, NULL, NULL),
    ('Daniel Ogbonna', '2026-03-12', ARRAY[c_x],     NULL, NULL, NULL),
    ('Daniel Ogbonna', '2026-03-13', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-03-14', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Daniel Ogbonna', '2026-03-15', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-03-16', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-03-17', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Daniel Ogbonna', '2026-03-18', ARRAY[c_x],     NULL, NULL, NULL),
    ('Daniel Ogbonna', '2026-03-19', ARRAY[c_x],     NULL, NULL, NULL),
    ('Daniel Ogbonna', '2026-03-20', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-03-21', ARRAY[c_d_snw], snw,  NULL, NULL),

    -- Alphince Baraza ─────────────────────────────────────────────────────────
    ('Alphince Baraza', '2026-03-08', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-09', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-10', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alphince Baraza', '2026-03-11', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alphince Baraza', '2026-03-12', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-13', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-14', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-15', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-16', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-17', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alphince Baraza', '2026-03-18', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alphince Baraza', '2026-03-19', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-20', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-21', ARRAY[c_e_sc],  sc,   NULL, NULL),

    -- Arphaxard Ouma ──────────────────────────────────────────────────────────
    ('Arphaxard Ouma', '2026-03-08', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-03-09', ARRAY[c_x],      NULL, NULL, NULL),
    ('Arphaxard Ouma', '2026-03-10', ARRAY[c_x],      NULL, NULL, NULL),
    ('Arphaxard Ouma', '2026-03-11', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Arphaxard Ouma', '2026-03-12', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Arphaxard Ouma', '2026-03-13', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Arphaxard Ouma', '2026-03-14', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-03-15', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-03-16', ARRAY[c_x],      NULL, NULL, NULL),
    ('Arphaxard Ouma', '2026-03-17', ARRAY[c_x],      NULL, NULL, NULL),
    ('Arphaxard Ouma', '2026-03-18', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Arphaxard Ouma', '2026-03-19', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-03-20', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-03-21', ARRAY[c_e_snw],  snw,  NULL, NULL),

    -- Mercy Kigera ────────────────────────────────────────────────────────────
    ('Mercy Kigera', '2026-03-08', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-09', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-10', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-11', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-12', ARRAY[c_x],      NULL, NULL, NULL),
    ('Mercy Kigera', '2026-03-13', ARRAY[c_x],      NULL, NULL, NULL),
    ('Mercy Kigera', '2026-03-14', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-15', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-16', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Mercy Kigera', '2026-03-17', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-18', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-19', ARRAY[c_x],      NULL, NULL, NULL),
    ('Mercy Kigera', '2026-03-20', ARRAY[c_x],      NULL, NULL, NULL),
    ('Mercy Kigera', '2026-03-21', ARRAY[c_fd_snw], snw,  NULL, NULL),

    -- Vicky Kiende ────────────────────────────────────────────────────────────
    ('Vicky Kiende', '2026-03-08', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Vicky Kiende', '2026-03-09', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-10', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-11', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-12', ARRAY[c_x],      NULL, NULL, NULL),
    ('Vicky Kiende', '2026-03-13', ARRAY[c_x],      NULL, NULL, NULL),
    ('Vicky Kiende', '2026-03-14', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-15', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Vicky Kiende', '2026-03-16', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-17', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-18', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-19', ARRAY[c_x],      NULL, NULL, NULL),
    ('Vicky Kiende', '2026-03-20', ARRAY[c_x],      NULL, NULL, NULL),
    ('Vicky Kiende', '2026-03-21', ARRAY[c_d_sc],   sc,   NULL, NULL),

    -- Sherry Otieno (Activity Coordinator — all SC) ──────────────────────────
    ('Sherry Otieno', '2026-03-08', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-09', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-10', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Sherry Otieno', '2026-03-11', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-12', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-13', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Sherry Otieno', '2026-03-14', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-15', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-16', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-17', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Sherry Otieno', '2026-03-18', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-19', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-20', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Sherry Otieno', '2026-03-21', ARRAY[c_x],    NULL, NULL, NULL),

    -- Deborah Gray (SC/Asst/Act/Cor — D shifts are SC) ───────────────────────
    ('Deborah Gray', '2026-03-08', ARRAY[c_03],   NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-09', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-10', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-11', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-12', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-13', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-14', ARRAY[c_x],    NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-15', ARRAY[c_03],   NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-16', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-17', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-18', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-19', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-20', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-21', ARRAY[c_x],    NULL, NULL, NULL),

    -- Grace Kamiti ────────────────────────────────────────────────────────────
    ('Grace Kamiti', '2026-03-08', ARRAY[c_x],  NULL, NULL, NULL),
    ('Grace Kamiti', '2026-03-09', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-10', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-11', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-12', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-13', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-14', ARRAY[c_x],  NULL, NULL, NULL),
    ('Grace Kamiti', '2026-03-15', ARRAY[c_x],  NULL, NULL, NULL),
    ('Grace Kamiti', '2026-03-16', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-17', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-18', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-19', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-20', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-21', ARRAY[c_x],  NULL, NULL, NULL),

    -- Stephen Onsabwa ─────────────────────────────────────────────────────────
    ('Stephen Onsabwa', '2026-03-08', ARRAY[c_ns], ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-09', ARRAY[c_ns], ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-10', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-11', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-12', ARRAY[c_x],  NULL, NULL, NULL),
    ('Stephen Onsabwa', '2026-03-13', ARRAY[c_x],  NULL, NULL, NULL),
    ('Stephen Onsabwa', '2026-03-14', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-15', ARRAY[c_ns], ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-16', ARRAY[c_ns], ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-17', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-18', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-19', ARRAY[c_x],  NULL, NULL, NULL),
    ('Stephen Onsabwa', '2026-03-20', ARRAY[c_x],  NULL, NULL, NULL),
    ('Stephen Onsabwa', '2026-03-21', ARRAY[c_ns], ns,   NULL, NULL),

    -- Aicha Langel ────────────────────────────────────────────────────────────
    ('Aicha Langel', '2026-03-08', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-09', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-10', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-11', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-12', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-13', ARRAY[c_x],  NULL, NULL, NULL),
    ('Aicha Langel', '2026-03-14', ARRAY[c_x],  NULL, NULL, NULL),
    ('Aicha Langel', '2026-03-15', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-16', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-17', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-18', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-19', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-20', ARRAY[c_x],  NULL, NULL, NULL),
    ('Aicha Langel', '2026-03-21', ARRAY[c_x],  NULL, NULL, NULL)

  ) AS v(emp_name, dt, codes, fa_id, cstart, cend)
  JOIN public.employees e ON e.name = v.emp_name AND e.company_id = company
  ON CONFLICT (emp_id, date) DO UPDATE SET
    published_shift_code_ids = EXCLUDED.published_shift_code_ids,
    focus_area_id = EXCLUDED.focus_area_id,
    custom_start_time = EXCLUDED.custom_start_time,
    custom_end_time = EXCLUDED.custom_end_time;

END $$;
