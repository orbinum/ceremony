/**
 * Repository rules oxlint has no built-in for. `header-only-comments`: a source or test file opens
 * with one `/** … *\/` block saying what it holds and why, and carries no other comment, so the
 * header is the only prose to keep true. Lint directives (`oxlint-disable…`) and triple-slash
 * references are code, not prose, and stay allowed. `.mjs` because oxlint loads plugins as ES
 * modules.
 */

const isDirective = (comment) =>
  comment.value.trimStart().startsWith("oxlint-disable") ||
  (comment.type === "Line" && comment.value.startsWith("/"));

const headerOnlyComments = {
  meta: {
    messages: {
      missing: "Open the file with one /** … */ header saying what it holds and why.",
      extra: "Only the file header may be a comment; move the reason into the header.",
    },
  },
  create(context) {
    return {
      Program(node) {
        const source = context.sourceCode;
        const comments = source.getAllComments().filter((c) => !isDirective(c));
        const [first, ...rest] = comments;
        const text = source.text.replace(/^#![^\n]*\n/, (m) => " ".repeat(m.length));
        const leading = first && text.slice(0, first.range[0]).trim() === "";
        if (!first || !leading || first.type !== "Block" || !first.value.startsWith("*")) {
          context.report({ node, messageId: "missing" });
        }
        for (const comment of leading ? rest : comments) {
          context.report({ loc: comment.loc, messageId: "extra" });
        }
      },
    };
  },
};

export default {
  meta: { name: "ceremony" },
  rules: { "header-only-comments": headerOnlyComments },
};
