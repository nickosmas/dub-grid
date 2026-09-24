import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const webRoot = resolve(repoRoot, "apps/web");
const distDir = ".next-e2e-prod";
const distPath = resolve(webRoot, distDir);
const defaultPort = 3002;
const defaultLoginEmailLimit = 200;
const canSignalProcessGroup = process.platform !== "win32";
let activeChild;

export function resolveProductionE2EConfig(env) {
  const redisUrl = env.E2E_UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = env.E2E_UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!redisUrl || !redisToken) {
    throw new Error(
      "E2E_UPSTASH_REDIS_REST_URL and E2E_UPSTASH_REDIS_REST_TOKEN are required. " +
        "Use a dedicated E2E Upstash database; production credentials are intentionally ignored.",
    );
  }

  const port = Number(env.E2E_PRODUCTION_PORT ?? defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 3000) {
    throw new Error("E2E_PRODUCTION_PORT must be a valid port other than 3000.");
  }

  const loginEmailLimit = Number(env.E2E_LOGIN_EMAIL_LIMIT_PER_15_MIN ?? defaultLoginEmailLimit);
  if (!Number.isInteger(loginEmailLimit) || loginEmailLimit < 1) {
    throw new Error("E2E_LOGIN_EMAIL_LIMIT_PER_15_MIN must be a positive integer.");
  }

  return { port, redisUrl, redisToken, loginEmailLimit };
}

function childEnv(config) {
  return {
    ...process.env,
    CI: "1",
    PORT: String(config.port),
    NEXT_DIST_DIR: distDir,
    UPSTASH_REDIS_REST_URL: config.redisUrl,
    UPSTASH_REDIS_REST_TOKEN: config.redisToken,
    LOGIN_EMAIL_LIMIT_PER_15_MIN: String(config.loginEmailLimit),
  };
}

function run(command, args, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: "inherit",
      // Keep the runner, not Playwright, in the terminal's foreground process
      // group. That lets its SIGINT/SIGTERM handler stop the whole child tree
      // and remove the temporary Next output before it exits.
      detached: canSignalProcessGroup,
    });
    activeChild = child;
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (activeChild === child) activeChild = undefined;
      if (code === 0) return resolveRun();
      rejectRun(
        new Error(
          `${command} ${args.join(" ")} ${signal ? `received ${signal}` : `exited ${code}`}`,
        ),
      );
    });
  });
}

function startServer(config, env) {
  return spawn(
    "npm",
    ["--workspace", "@dubgrid/web", "run", "start", "--", "--port", String(config.port)],
    {
      cwd: repoRoot,
      env,
      stdio: "inherit",
      detached: canSignalProcessGroup,
    },
  );
}

async function waitForServer(port) {
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server has not bound the port yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw new Error(`Production E2E server did not become ready at ${url} within 60 seconds.`);
}

async function stopProcess(process) {
  if (process.exitCode !== null || process.signalCode !== null) return;

  signalProcessTree(process, "SIGTERM");
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      signalProcessTree(process, "SIGKILL");
      resolveStop();
    }, 5_000);
    process.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
  });
}

function signalProcessTree(child, signal) {
  if (canSignalProcessGroup && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The child may have already exited, or the host may not permit process
      // group signals. Fall through to the portable direct-child behavior.
    }
  }
  child.kill(signal);
}

async function removeTemporaryBuildOutput() {
  if (basename(distPath) !== distDir || !distPath.startsWith(`${webRoot}/`)) {
    throw new Error("Refusing to remove an unexpected production-E2E build directory.");
  }
  await rm(distPath, { recursive: true, force: true });
}

export function createInterruptGuard(
  runtime = process,
  stopActiveChild = () => activeChild && signalProcessTree(activeChild, "SIGTERM"),
) {
  let rejectInterruption;
  let interruption;
  const interrupted = new Promise((_, reject) => {
    rejectInterruption = reject;
  });

  const interrupt = (signal) => {
    if (interruption) return;
    interruption = new Error(`Production E2E runner received ${signal}.`);
    stopActiveChild();
    rejectInterruption(interruption);
  };

  const onSigint = () => interrupt("SIGINT");
  const onSigterm = () => interrupt("SIGTERM");
  runtime.once("SIGINT", onSigint);
  runtime.once("SIGTERM", onSigterm);

  return {
    waitFor: (work) => Promise.race([work, interrupted]),
    dispose: () => {
      runtime.removeListener("SIGINT", onSigint);
      runtime.removeListener("SIGTERM", onSigterm);
    },
  };
}

async function main() {
  const config = resolveProductionE2EConfig(process.env);
  const env = childEnv(config);
  const interrupts = createInterruptGuard();
  let server;

  try {
    await interrupts.waitFor(removeTemporaryBuildOutput());
    await interrupts.waitFor(run("npm", ["--workspace", "@dubgrid/web", "run", "build"], env));
    server = startServer(config, env);
    await interrupts.waitFor(waitForServer(config.port));
    await interrupts.waitFor(run("npx", ["playwright", "test"], env));
  } finally {
    interrupts.dispose();
    if (activeChild) await stopProcess(activeChild);
    if (server) await stopProcess(server);
    await removeTemporaryBuildOutput();
  }
}

const isDirectInvocation =
  process.argv[1] != null && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectInvocation) {
  main().catch((error) => {
    console.error(`[production-e2e] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
