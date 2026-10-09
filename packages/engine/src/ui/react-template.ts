// Compiles an admin-authored react-email component (JSX source string) to HTML:
// transpile (sucrase) → eval → render(). It runs inside the editor's compile
// Web Worker (email-editor/react-compile.worker.ts), never on the dashboard
// page and never on the server — the worker has no DOM or cookies and its
// network globals are disabled.
//
// ponytail: new Function eval of admin source. Acceptable because it is
// admin-only and isolated in the worker. Do NOT move this to the server
// without an isolated-vm sandbox.

import { transform } from "sucrase";
import * as React from "react";
import * as components from "@react-email/components";
import { render } from "@react-email/render";

export const REACT_SOURCE_MARKER = "/*react-email*/";

/** Transpile + evaluate + render a react-email component source to HTML. */
export async function compileReactSource(source: string): Promise<string> {
  const { code } = transform(source, {
    transforms: ["jsx", "typescript", "imports"],
    jsxRuntime: "classic",
    production: true,
  });
  // Components and React are injected as scope; `import` statements in the source
  // are stripped to no-ops by the imports transform, so it never pulls modules.
  const scope: Record<string, unknown> = { React, ...components };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function(
    "module",
    "exports",
    ...Object.keys(scope),
    `${code}\nreturn module.exports.default || exports.default;`,
  );
  const Email = factory(mod, mod.exports, ...Object.values(scope));
  if (typeof Email !== "function") throw new Error("Template must `export default` a component");
  return render(React.createElement(Email as React.ComponentType));
}

