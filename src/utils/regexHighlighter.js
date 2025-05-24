// regexHighlighter.js
import { Decoration, EditorView } from "@codemirror/view";
import { RangeSetBuilder, StateField } from "@codemirror/state";

// Create a StateField to store highlighting information
export const regexHighlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(highlights, tr) {
    if (!tr.docChanged && !tr.selection) return highlights;
    
    // Rebuild decorations when the document changes
    const builder = new RangeSetBuilder();
    const decorations = []; // Store decorations here

    
    // Define your regex patterns and their styles here
    const patterns = [
      { regex: /\b(sum|avg|median|stddev|factorial|percentage)\b/g, class: "cm-function" },
      { regex: /\b\d+(\.\d+)?\b/g, class: "cm-number" },
      { regex: /=([^=].*?)$/gm, class: "cm-formula" },
      { regex: /"(.*?)"/g, class: "cm-string" },
      { regex: /^(\w+)\s*[:=]\s*(.+)$/gm, class: "cm-variable-assignment" },
      // Add more patterns as needed for your specific use case
    ];
   
  for (let i = 1; i <= tr.state.doc.lines; i++) {
    const line = tr.state.doc.line(i);
    const lineText = line.text;

    for (const { regex, class: className } of patterns) {
      regex.lastIndex = 0;
      let match;

      while ((match = regex.exec(lineText)) !== null) {
        const start = line.from + match.index;
        const end = start + match[0].length;

        decorations.push({ start, end, className }); // Store decoration info
      }
    }
  }

  // Sort decorations by start position
  decorations.sort((a, b) => a.start - b.start);

  // Build the RangeSet
  for (const { start, end, className } of decorations) {
    const decoration = Decoration.mark({
      class: className,
    });
    builder.add(start, end, decoration);
  }

  return builder.finish();
},
provide: field => EditorView.decorations.from(field),
});

// Create the theme for the highlighting
export const regexHighlightTheme = EditorView.baseTheme({
  ".cm-function": { color: "#6f42c1", fontWeight: "bold" },
  ".cm-number": { color: "#005cc5" },
  ".cm-formula": { color: "#22863a", fontStyle: "italic" },
  ".cm-string": { color: "#e36209" },
  ".cm-variable-assignment": { color: "#d1345f", fontWeight: "bold" }, // New style

  // Dark theme variants
  "&.dark .cm-function": { color: "#b392f0" },
  "&.dark .cm-number": { color: "#79b8ff" },
  "&.dark .cm-formula": { color: "#85e89d" },
  "&.dark .cm-string": { color: "#ffab70" },
  "&.dark .cm-variable-assignment": { color: "#ff79c6" }, // New dark style

});

// Combine the field and theme into a single extension
export function regexHighlightExtension() {
  return [
    regexHighlightField,
    regexHighlightTheme
  ];
}
