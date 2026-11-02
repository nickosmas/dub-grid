-- 115: Organizations that never chose a label follow the product default.
--
-- Organization setup and Settings > Labels used to store the default text
-- itself, so a later default never reached those organizations. The app now
-- stores NULL unless a label is chosen, and the defaults become Areas and
-- Departments. This resets the two earlier defaults it wrote. A custom label is
-- untouched.
SET lock_timeout = '5s';

UPDATE public.organizations
SET focus_area_label = NULL
WHERE focus_area_label = 'Focus Areas';

UPDATE public.organizations
SET department_label = NULL
WHERE department_label = 'Scheduled Departments';
