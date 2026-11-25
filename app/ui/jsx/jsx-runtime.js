// JSX runtime for the staff pages. These pages were written for Preact, where `onChange`, `onDismiss` and the like on a
// Polaris web component (an `s-*` tag) listen for the native event of that name. React only does that for lowercase
// names: it ignores `onChange` on a custom element and listens for "Dismiss" instead of "dismiss". So for `s-*` tags we
// lowercase every `onXxx` prop, which makes React add a plain listener for the native event.
import * as R from "react/jsx-runtime";

export const Fragment = R.Fragment;

export function fixProps(type, props) {
  if (typeof type !== "string" || !type.startsWith("s-") || !props) return props;
  let out = null;
  for (const key of Object.keys(props)) {
    if (/^on[A-Z]/.test(key)) {
      out ??= { ...props };
      delete out[key];
      out[key.toLowerCase()] = props[key];
    }
  }
  return out ?? props;
}

export const jsx = (type, props, key) => R.jsx(type, fixProps(type, props), key);
export const jsxs = (type, props, key) => R.jsxs(type, fixProps(type, props), key);
