# LaTeX Referencer for Obsidian

> [!important]
> This plugin is a fork of [AlbusGuo/albus-latex-referencer](https://github.com/AlbusGuo/albus-latex-referencer). It keeps the theorem/equation referencing workflow and adds extra styles, Chinese support, LaTeX-style theorem environments, proof rendering improvements, and integrated preview/search helpers.

## Overview

LaTeX Referencer brings a LaTeX-like theorem, proof, equation, and reference workflow into Obsidian. It is designed for mathematical notes where you want stable labels, automatic numbering, searchable theorem/equation indexes, and readable rendered notes in both Live Preview and Reading View.

Typical use cases include:

- Writing theorem, lemma, definition, example, remark, proof, and equation notes in Obsidian.
- Referencing theorem-like blocks and equations across a vault.
- Keeping theorem numbering consistent while editing notes.
- Using LaTeX-style `\begin{...}` / `\end{...}` environments instead of only Obsidian callouts.
- Publishing or reading notes with cleaner theorem/proof styling.

## Features

- **Theorem-like callouts**: Supports theorem, lemma, proposition, corollary, definition, example, exercise, claim, axiom, assumption, conjecture, hypothesis, remark, and math-like environments.
- **Automatic numbering**: Supports automatic theorem numbering and multiple numbering modes configured from the plugin settings.
- **Equation support**: Provides an indexing and referencing workflow for equations in mathematical notes.
- **References and search**: Integrates quick preview, math links, and search helpers for theorem/equation references.
- **LaTeX-style theorem environments**: Supports syntax such as `\begin{theorem}` ... `\end{theorem}` in Reading View, Live Preview, and indexing.
- **Proof environments**: Supports LaTeX-style proof delimiters such as `\begin{proof}` and `\end{proof}`.
- **No blank-line requirement for proofs**: Proof delimiters can be rendered when they appear on their own lines, even without blank lines around the proof content.
- **Code block safety**: Theorem and proof parsing skips fenced code blocks and rendered `<pre>` code blocks, so examples are not accidentally transformed.
- **Styles**: Includes multiple theorem callout styles, including the additional `card` style.
- **Chinese support**: Adds Chinese-friendly usage and profile support.

## Basic usage

### Theorem callouts

You can write theorem-like content with Obsidian callouts:

```markdown
> [!theorem] Pythagorean theorem
> For a right triangle with legs $a,b$ and hypotenuse $c$,
> $$a^2+b^2=c^2.$$
```

Other supported callout types include:

```markdown
> [!definition] Group
> A group is a set with an associative binary operation, identity, and inverses.

> [!lemma] Useful lemma
> This lemma will be referenced later.

> [!example] Example
> Here is a concrete example.
```

The plugin reads these theorem-like blocks, applies styling, and participates in numbering/indexing according to your settings.

### LaTeX-style theorem environments

You can also write theorem-like content with LaTeX-style environments:

```markdown
\begin{theorem}[Pythagorean theorem]
For a right triangle with legs $a,b$ and hypotenuse $c$,
$$a^2+b^2=c^2.$$
\end{theorem}
```

A label can be placed near the environment and will be converted for indexing/reference workflows:

```markdown
\begin{lemma}[Compactness lemma]
\label{lem:compactness}
Every finite open cover has a finite subcover.
\end{lemma}
```

Supported environment names include theorem-like names such as:

- `theorem`
- `lemma`
- `proposition`
- `corollary`
- `definition`
- `example`
- `exercise`
- `claim`
- `axiom`
- `assumption`
- `conjecture`
- `hypothesis`
- `remark`

The parser also skips Markdown fenced code blocks, so examples like this remain untouched:

````markdown
```tex
\begin{theorem}
This is only a code sample.
\end{theorem}
```
````

### Proof environments

Use proof delimiters in a LaTeX-like way:

```markdown
\begin{proof}
This is the proof.
\end{proof}
```

The delimiters only need to be on their own lines. They do not need to be separated from the proof body by blank lines.

You can also use a custom proof title:

```markdown
\begin{proof}[Proof of the main theorem]
The argument goes as follows.
\end{proof}
```

### Styling

The plugin includes several theorem callout styles. The fork adds and improves the `card` style, with separate color handling for different theorem-like environments and dark-theme adaptations.

Style-related source files live in:

- `styles.scss`
- `styles/`

Generated release CSS is written to `styles.css` after building.

## Installation

### Manual installation from release files

For manual installation in an Obsidian vault, copy the release artifacts into:

```text
<your-vault>/.obsidian/plugins/albus-latex-referencer/
```

Required files:

- `main.js`
- `styles.css`
- `manifest.json`

Then enable the plugin in Obsidian community plugin settings.

### Build from source

Clone the repository and install dependencies:

```bash
npm ci
```

Build the plugin:

```bash
npm run build
```

This generates:

- `main.js`
- `styles.css`

`manifest.json` is already part of the source tree and should be included together with those generated files when publishing a release.

## Development notes

This repository contains the full source code of the plugin. Make feature changes in source files, not directly in generated release files.

Use these locations for common changes:

- `src/`: TypeScript plugin logic.
- `src/theorem-callouts/`: Theorem callout parsing, rendering, numbering, and LaTeX theorem environment support.
- `src/proof/`: Proof environment rendering for Live Preview and Reading View.
- `src/index/`: Markdown indexing and worker import logic.
- `styles.scss` and `styles/`: SCSS/CSS source for plugin styling.

Generated artifacts are intentionally ignored by Git:

- `main.js`
- `styles.css`
- `styles.css.map`

They should be built from source and uploaded as release assets instead of committed as source files.

## Release checklist

Before publishing a new release:

```bash
npm ci
npm run build
```

Then upload these files to the GitHub release:

- `main.js`
- `styles.css`
- `manifest.json`

For source code commits, commit the TypeScript/SCSS source files and documentation, not the generated release artifacts.

## What changed in this fork

- Chinese is now available.
- Added a theorem callout style named `card`.
- Added additional theorem callout indexes.
- Integrated quick-preview and mathlinks helpers.
- Added LaTeX-style theorem environment support in Reading View, Live Preview, and indexing.
- Improved proof environment rendering so blank lines are not required around proof delimiters.
- Added code-block skipping to avoid transforming examples inside fenced code blocks.

## Credits

This project is forked from [AlbusGuo/albus-latex-referencer](https://github.com/AlbusGuo/albus-latex-referencer), which is based on [obsidian-latex-theorem-equation-referencer](https://github.com/RyotaUshio/obsidian-latex-theorem-equation-referencer) by Ryota Ushio.