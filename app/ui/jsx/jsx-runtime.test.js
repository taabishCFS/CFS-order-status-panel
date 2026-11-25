import { describe, expect, it } from "vitest";
import { fixProps, jsx } from "./jsx-runtime.js";

describe("fixProps", () => {
  it("lowercases event props on Polaris web components so React listens for the native event", () => {
    const onChange = () => {};
    const onDismiss = () => {};
    expect(fixProps("s-select", { value: "a", onChange, onDismiss })).toEqual({ value: "a", onchange: onChange, ondismiss: onDismiss });
  });

  it("leaves ordinary tags, our own components and props without events alone", () => {
    const props = { onChange: () => {} };
    expect(fixProps("input", props)).toBe(props);
    expect(fixProps(() => null, props)).toBe(props);
    const plain = { heading: "Orders" };
    expect(fixProps("s-page", plain)).toBe(plain);
  });

  it("does not change the props it was given", () => {
    const props = { onClick: () => {} };
    fixProps("s-button", props);
    expect(Object.keys(props)).toEqual(["onClick"]);
  });

  it("builds an element whose handler sits on the lowercase prop", () => {
    const onInput = () => {};
    expect(jsx("s-text-field", { onInput }).props.oninput).toBe(onInput);
  });
});
