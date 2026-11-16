import type { Session, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { resolveAuthEventUser } from "./auth-event-user";

const person = { id: "user-1" } as User;
const someoneElse = { id: "user-2" } as User;
const sessionFor = (user: User) => ({ access_token: "t", user }) as unknown as Session;

describe("resolveAuthEventUser", () => {
  it("takes the user a refresh or sign-in returned without asking again", async () => {
    const verify = vi.fn();
    const result = await resolveAuthEventUser({
      event: "TOKEN_REFRESHED",
      session: sessionFor(person),
      currentUser: person,
      verify,
    });
    expect(result).toEqual({ kind: "commit", user: person });
    expect(verify).not.toHaveBeenCalled();
  });

  it("verifies any other event", async () => {
    const result = await resolveAuthEventUser({
      event: "INITIAL_SESSION",
      session: sessionFor(person),
      currentUser: null,
      verify: async () => person,
    });
    expect(result).toEqual({ kind: "commit", user: person });
  });

  it("signs out when the auth server rejects the session", async () => {
    const result = await resolveAuthEventUser({
      event: "INITIAL_SESSION",
      session: sessionFor(person),
      currentUser: person,
      verify: async () => null,
    });
    expect(result).toEqual({ kind: "commit", user: null });
  });

  // 2026-11-15: a laptop waking from sleep failed this check on the network,
  // the person read as signed out, and every cached query was wiped.
  it("keeps the signed-in person when the auth server can't be reached", async () => {
    const result = await resolveAuthEventUser({
      event: "INITIAL_SESSION",
      session: sessionFor(person),
      currentUser: person,
      verify: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(result).toEqual({ kind: "commit", user: person });
  });

  it("changes nothing when an unreachable check concerns someone else", async () => {
    const result = await resolveAuthEventUser({
      event: "INITIAL_SESSION",
      session: sessionFor(someoneElse),
      currentUser: person,
      verify: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(result).toEqual({ kind: "keep" });
  });
});
