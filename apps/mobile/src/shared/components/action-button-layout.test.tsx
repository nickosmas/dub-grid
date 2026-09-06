import { Fragment } from "react";
import { describe, expect, it } from "vitest";
import { getActionItems, getOrderedActionItems } from "./action-button-layout";

describe("visible action grouping", () => {
  it("does not let hidden actions consume either position in the first row", () => {
    const first = <button key="first">Save</button>;
    const second = <button key="second">Cancel</button>;
    const items = getActionItems([false, null, first, undefined, second]);
    expect(items.map(({ node }) => (node as typeof first).props.children)).toEqual([
      "Save",
      "Cancel",
    ]);
  });

  it("includes nested conditional fragments in reading order without merging their keys", () => {
    const items = getActionItems([
      <Fragment key="access">
        <button key="action">Edit access</button>
      </Fragment>,
      <Fragment key="status">
        {null}
        <>
          <button key="action">Activate</button>
          <button key="remove">Remove</button>
        </>
      </Fragment>,
      <button key="cancel">Cancel</button>,
    ]);
    expect(
      items.map(({ node }) => (node as React.ReactElement<{ children: string }>).props.children),
    ).toEqual(["Edit access", "Activate", "Remove", "Cancel"]);
    expect(new Set(items.map(({ key }) => key)).size).toBe(4);
  });

  it("keeps an action's identity when a preceding conditional action disappears", () => {
    const render = (showFirst: boolean) =>
      getActionItems([
        showFirst && <button key="first">Save</button>,
        <button key="second">Cancel</button>,
      ]);
    expect(render(true)[1].key).toBe(render(false)[0].key);
    expect(getActionItems([false, null, undefined])).toEqual([]);
  });

  it("always places the primary action after visible supporting actions", () => {
    const items = getOrderedActionItems(
      [null, <button key="back">Back</button>, <button key="help">Help</button>],
      <button key="save">Save</button>,
    );

    expect(
      items.map(({ node }) => (node as React.ReactElement<{ children: string }>).props.children),
    ).toEqual(["Back", "Help", "Save"]);
  });
});
