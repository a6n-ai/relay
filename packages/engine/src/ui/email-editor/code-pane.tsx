"use client";

import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { linter, type Diagnostic } from "@codemirror/lint";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { editorDiagnostics } from "./diagnostics";

// Colours come from the app's tokens so the pane follows light/dark themes.
const highlight = HighlightStyle.define([
  { tag: [tags.tagName, tags.keyword], color: "var(--primary)" },
  { tag: [tags.attributeName, tags.propertyName], color: "var(--chart-2, var(--foreground))" },
  { tag: [tags.string, tags.attributeValue], color: "var(--chart-3, var(--foreground))" },
  { tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: "1.6" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted-foreground)", border: "none" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in oklch, var(--foreground) 5%, transparent)" },
  ".cm-content": { caretColor: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
});

const languageFor = (l: "html" | "tsx") => (l === "html" ? html() : javascript({ jsx: true, typescript: true }));

// `{{` offers the surface's variable registry.
const variableCompletion = (vars: readonly string[]) =>
  autocompletion({
    override: [
      (ctx: CompletionContext) => {
        const m = ctx.matchBefore(/\{\{[\w.]*/);
        if (!m) return null;
        return {
          from: m.from + 2,
          options: vars.map((v) => ({ label: v, type: "variable", apply: `${v}}}` })),
          validFor: /^[\w.]*$/,
        };
      },
    ],
  });

const diagnosticsLinter = (vars: readonly string[], l: "html" | "tsx") =>
  linter((v) => editorDiagnostics(v.state.doc.toString(), { language: l, known: vars }) as Diagnostic[], { delay: 400 });

/** CodeMirror pane for email source. Uncontrolled internally; `value` changes from outside replace the document. */
export function CodePane({
  value,
  language,
  variables,
  onChange,
  label,
}: {
  value: string;
  language: "html" | "tsx";
  variables: readonly string[];
  onChange: (v: string) => void;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lang = useRef(new Compartment());
  const lint = useRef(new Compartment());
  const complete = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          theme,
          syntaxHighlighting(highlight),
          lang.current.of(languageFor(language)),
          complete.current.of(variableCompletion(variables)),
          lint.current.of(diagnosticsLinter(variables, language)),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; the effects below reconfigure
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: [
        lang.current.reconfigure(languageFor(language)),
        complete.current.reconfigure(variableCompletion(variables)),
        lint.current.reconfigure(diagnosticsLinter(variables, language)),
      ],
    });
  }, [language, variables]);

  // External value changes (Format, Insert starter, HTML/React switch) replace the doc.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.contentDOM.setAttribute("aria-label", label);
  }, [label]);

  return <div ref={host} className="h-full overflow-hidden" />;
}
