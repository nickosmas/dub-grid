import { describe, expect, it } from "vitest";
import { mergeDraftChangedBroadcastPayload, readDraftChangedBroadcast } from "./draft-broadcast";

const SESSION = "editor-session-1";
const editor = { editorSessionId: SESSION, canEditShifts: true };
const noteEditor = { editorSessionId: SESSION, canEditShifts: false };
const shifts = { "emp-1_2026-09-21": null };
const notes = { "emp-1_2026-09-21": [] };

describe("readDraftChangedBroadcast", () => {
  it("ignores this session's own echo", () => {
    expect(readDraftChangedBroadcast({ senderSessionId: SESSION, shifts }, editor)).toBeNull();
    expect(readDraftChangedBroadcast(undefined, editor)).toBeNull();
  });

  it("applies both halves for a shift editor", () => {
    expect(readDraftChangedBroadcast({ senderSessionId: "peer", shifts, notes }, editor)).toEqual({
      shifts,
      notes,
      refetch: false,
    });
  });

  it("drops the shift half for a note editor who may not see draft cells", () => {
    expect(
      readDraftChangedBroadcast({ senderSessionId: "peer", shifts, notes }, noteEditor),
    ).toEqual({ shifts: undefined, notes, refetch: false });
  });

  it("does not turn a dropped shift diff into a refetch", () => {
    expect(readDraftChangedBroadcast({ senderSessionId: "peer", shifts }, noteEditor)).toEqual({
      shifts: undefined,
      notes: undefined,
      refetch: false,
    });
  });

  it("refetches when the sender named nothing", () => {
    expect(readDraftChangedBroadcast({ senderSessionId: "peer" }, editor)).toEqual({
      shifts: undefined,
      notes: undefined,
      refetch: true,
    });
  });
});

describe("readDraftChangedBroadcast, ordering", () => {
  const cell = (version: number) => ({ version }) as never;

  it("drops a cell the receiver already holds a newer copy of", () => {
    const actions = readDraftChangedBroadcast(
      { senderSessionId: "peer", shifts: { "emp-1_2026-09-21": cell(4) } },
      { ...editor, currentShifts: { "emp-1_2026-09-21": cell(5) } },
    );

    expect(actions).toEqual({ shifts: undefined, notes: undefined, refetch: false });
  });

  it("drops a replay of the version already held", () => {
    const actions = readDraftChangedBroadcast(
      { senderSessionId: "peer", shifts: { "emp-1_2026-09-21": cell(5) } },
      { ...editor, currentShifts: { "emp-1_2026-09-21": cell(5) } },
    );

    expect(actions?.shifts).toBeUndefined();
  });

  it("applies a newer cell, and one the receiver does not hold at all", () => {
    const actions = readDraftChangedBroadcast(
      {
        senderSessionId: "peer",
        shifts: { "emp-1_2026-09-21": cell(6), "emp-2_2026-09-21": cell(1) },
      },
      { ...editor, currentShifts: { "emp-1_2026-09-21": cell(5) } },
    );

    expect(Object.keys(actions?.shifts ?? {})).toEqual(["emp-1_2026-09-21", "emp-2_2026-09-21"]);
  });

  it("takes a deletion and an unsaved cell as sent, since neither carries an order", () => {
    const actions = readDraftChangedBroadcast(
      {
        senderSessionId: "peer",
        shifts: { "emp-1_2026-09-21": null, "emp-2_2026-09-21": {} as never },
      },
      { ...editor, currentShifts: { "emp-1_2026-09-21": cell(5), "emp-2_2026-09-21": cell(5) } },
    );

    expect(Object.keys(actions?.shifts ?? {})).toEqual(["emp-1_2026-09-21", "emp-2_2026-09-21"]);
  });

  it("keeps working for a receiver that has not loaded its window yet", () => {
    const actions = readDraftChangedBroadcast(
      { senderSessionId: "peer", shifts: { "emp-1_2026-09-21": cell(1) } },
      editor,
    );

    expect(actions?.shifts).toEqual({ "emp-1_2026-09-21": cell(1) });
  });
});

describe("mergeDraftChangedBroadcastPayload", () => {
  it("unions the shift and note halves of two queued diffs", () => {
    const merged = mergeDraftChangedBroadcastPayload(
      { senderId: "a", shifts: { one: 1 }, notes: { n1: 1 } },
      { senderId: "b", shifts: { two: 2 } },
    );
    expect(merged).toEqual({
      senderId: "b",
      shifts: { one: 1, two: 2 },
      notes: { n1: 1 },
    });
  });

  it("leaves a payload-less broadcast without empty halves", () => {
    expect(mergeDraftChangedBroadcastPayload({ senderId: "a" }, { senderId: "b" })).toEqual({
      senderId: "b",
    });
  });
});
