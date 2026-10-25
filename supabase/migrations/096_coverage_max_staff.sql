-- 096: A coverage requirement can say how many staff it takes at most.
--
-- Auto-build tops people up to five days a week in a shift they can take,
-- even one already staffed, so a one-person requirement such as a supervisor
-- could get a second person. `max_staff` caps what a build or a suggestion
-- adds; null means no limit. Schedulers can still staff past it by hand.

ALTER TABLE public.coverage_requirements
  ADD COLUMN max_staff INTEGER;

ALTER TABLE public.coverage_requirements ADD CONSTRAINT coverage_req_max_check
  CHECK (max_staff IS NULL OR (max_staff >= 1 AND max_staff >= min_staff));
