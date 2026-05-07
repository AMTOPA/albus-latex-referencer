# LaTeX Referencer for Obsidian

> [!important]
> This plugin is forked form [https://github.com/RyotaUshio/obsidian-latex-theorem-equation-referencer](https://github.com/RyotaUshio/obsidian-latex-theorem-equation-referencer). The original plugin cannot satisfy my own needs, so I tried to make something new!

# What's changed

- Chinese is now available.
- Adding a new theorem callouts' style named `card`.
- Adding two new index for theorem callouts.
- Now the front-end plugins `quick-preview` and `mathlinks` have now been integrated.
- LaTeX-style theorem environments such as `\begin{theorem}` ... `\end{theorem}` are supported in reading view, live preview, and indexing.
- LaTeX proof environments such as `\begin{proof}` ... `\end{proof}` can be rendered without requiring blank lines around the delimiters.
- Theorem and proof environment parsing skips fenced code blocks to avoid transforming examples.

The other features are not changed.

# Development and release

This repository contains the full source code of the plugin. Make changes in `src/`, `styles.scss`, and `styles/`, then build the release files from source:

```bash
npm ci
npm run build
```

The build generates the Obsidian release artifacts:

- `main.js`
- `styles.css`
- `manifest.json`

Commit the source code to GitHub. Upload the three release artifacts above when publishing or manually installing the plugin.