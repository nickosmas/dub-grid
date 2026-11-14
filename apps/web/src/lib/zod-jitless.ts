import { config } from "zod/v4/core";

// zod 4 probes `new Function` before compiling an object parser. The CSP
// forbids eval, so the probe fails and the browser reports a CSP violation
// on every page that parses a schema, though zod catches the throw. Jitless
// skips the probe; the server has no CSP and keeps the compiled parsers.
config({ jitless: true });
