# Fix: A slow package mirror no longer stalls a Playwright shard

**Type:** Fix
**Status:** verified
**Branch:** `fix/e2e-install-retry`

## The problem

`playwright install --with-deps` ran with no limit of its own, so a slow download
used up the 60-minute job limit before any test ran. The job then read as
cancelled, and both #342 and #343 needed a rerun that added about an hour each.

It is one bad connection, not the package set. On #343 four WebKit runners fetched
the same 139 MB in the same minute: 17 seconds, 41 seconds, 31 minutes 38 seconds
(65.8 kB/s), and past the limit. The step normally takes 20 to 45 seconds; 6 of
the last 168 installs took 10 to 32 minutes, and that count leaves out the two
that hit the limit, since a rerun replaces a job's first attempt in the API.

## The fix

- **System dependencies get their own step**, with `timeout` running as root. As
  the runner user it could not kill the `apt-get` that sudo starts, which would
  hold the lock against the retry.
- **Each attempt gets 5 minutes, up to 3 times.** Between attempts the Azure mirror
  is dropped, so the retry takes a different route. A download killed part way
  starts again, so the retry relies on the better route, not on resuming.
- **The dpkg repair repeats until it succeeds.** dpkg outlives the kill and holds
  its lock for a while, so a single repair could fail and leave the next attempt
  to stop at "dpkg was interrupted". A forced timeout on real runners showed this.
- **The step has a 20-minute limit and the browser download 15**, so a stall fails
  plainly in minutes rather than as a cancelled job an hour later.

## Verify

See the pull request for the forced-timeout run on real runners.
