import * as D from "react/jsx-dev-runtime";
import { fixProps } from "./jsx-runtime.js";

export const Fragment = D.Fragment;
export const jsxDEV = (type, props, key, isStatic, source, self) =>
  D.jsxDEV(type, fixProps(type, props), key, isStatic, source, self);
