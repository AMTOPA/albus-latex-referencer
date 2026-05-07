import { editorInfoField } from 'obsidian';
import { RangeSetBuilder, SelectionRange } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { SyntaxNodeRef } from '@lezer/common';
import { syntaxTree } from '@codemirror/language';

import LatexReferencer from 'main';
import { nodeText, rangesHaveOverlap } from 'utils/editor';
import { Profile } from 'settings/profile';
import { renderMarkdown } from 'utils/render';
import { resolveSettings } from 'utils/plugin';
import { makeProofClasses, makeProofElement, parseProofText } from './common';

export const INLINE_CODE = "inline-code";
export const LINK_BEGIN = "formatting-link_formatting-link-start";
export const LINK = "hmd-internal-link";
export const LINK_END = "formatting-link_formatting-link-end";


abstract class ProofWidget extends WidgetType {
    containerEl: HTMLElement | null;

    constructor(public plugin: LatexReferencer, public profile: Profile) {
        super();
        this.containerEl = null;
    }

    eq(other: EndProofWidget): boolean {
        return this.profile.id === other.profile.id;
    }

    toDOM(): HTMLElement {
        return this.containerEl ?? (this.containerEl = this.initDOM());
    }

    abstract initDOM(): HTMLElement;

    ignoreEvent(event: Event): boolean {
        // the DOM element won't respond to clicks without this
        return false;
    }
}

class BeginProofWidget extends ProofWidget {
    containerEl: HTMLElement | null;

    constructor(
        plugin: LatexReferencer, profile: Profile,
        public display: string | null,
        public linktext: string | null,
        public sourcePath: string
    ) {
        super(plugin, profile);
    }

    eq(other: BeginProofWidget): boolean {
        return this.profile.id === other.profile.id && this.display === other.display && this.linktext === other.linktext && this.sourcePath == other.sourcePath;
    }

    initDOM(): HTMLElement {
        let display = this.linktext
            ? `${this.profile.body.proof.linkedBeginPrefix} [[${this.linktext}]]${this.profile.body.proof.linkedBeginSuffix}`
            : this.display;

        if (display) {
            const el = createSpan({ cls: makeProofClasses("begin", this.profile) });
            BeginProofWidget.renderDisplay(el, display, this.sourcePath, this.plugin);
            return el;
        }

        return makeProofElement("begin", this.profile);
    }

    static async renderDisplay(el: HTMLElement, display: string, sourcePath: string, plugin: LatexReferencer) {
        const children = await renderMarkdown(display, sourcePath, plugin);
        if (children) {
            el.replaceChildren(...children);
        }
    }
}


class EndProofWidget extends ProofWidget {
    containerEl: HTMLElement | null;

    initDOM(): HTMLElement {
        return makeProofElement("end", this.profile);
    }
}


export interface ProofPosition {
    display?: string,
    linktext?: string,
    linknodes?: { linkBegin: SyntaxNodeRef, link: SyntaxNodeRef, linkEnd: SyntaxNodeRef },
}


export const createProofDecoration = (plugin: LatexReferencer) => ViewPlugin.fromClass(
    class implements PluginValue {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.makeDeco(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                if (update.view.composing) {
                    this.decorations = this.decorations.map(update.changes); // User is using IME
                } else {
                    this.decorations = this.makeDeco(update.view);
                }
            }
        }

        makeDeco(view: EditorView): DecorationSet {
            const { state } = view;
            const { app } = plugin;
            const tree = syntaxTree(state);
            const ranges = state.selection.ranges;

            const file = state.field(editorInfoField).file;
            const sourcePath = file?.path ?? "";
            const settings = resolveSettings(undefined, plugin, file ?? app.vault.getRoot());
            const profile = plugin.extraSettings.profiles[settings.profile];

            const builder = new RangeSetBuilder<Decoration>();
            const proofRanges: { start: number, end: number, widget: BeginProofWidget | EndProofWidget }[] = [];

            for (const { from, to } of view.visibleRanges) {
                tree.iterate({
                    from, to,
                    enter(node) {
                        if (node.name !== INLINE_CODE) return;

                        let start = -1;
                        let end = -1;
                        let display: string | null = null;
                        let linktext: string | null = null;

                        const text = nodeText(node, state);
                        const parsed = parseProofText(text, settings);

                        if (parsed?.which === "begin") {
                            display = parsed.display;
                            linktext = parsed.linktext;
                            start = node.from - 1;
                            end = node.to + 1; // 1 = "`".length

                            if (start === -1 || end === -1) return; // not proof

                            if (state.sliceDoc(node.to + 1, node.to + 2) == "@") { // Check if "`\begin{proof}`@[[link]]" or "`\begin{proof}[display]`@[[link]]"
                                const next = node.node.nextSibling?.nextSibling;
                                const afterNext = node.node.nextSibling?.nextSibling?.nextSibling;
                                const afterAfterNext = node.node.nextSibling?.nextSibling?.nextSibling?.nextSibling;
                                if (next?.name === LINK_BEGIN && afterNext?.name === LINK && afterAfterNext?.name === LINK_END) {
                                    linktext = nodeText(afterNext, state);
                                    end = afterAfterNext.to;
                                }
                            }

                            if (!rangesHaveOverlap(ranges, start, end)) {
                                proofRanges.push({ start, end, widget: new BeginProofWidget(plugin, profile, display, linktext, sourcePath) });
                            }

                        } else if (parsed?.which === "end") {
                            // handle "\end{proof}"
                            start = node.from - 1;
                            end = node.to + 1; // 1 = "`".length

                            if (!rangesHaveOverlap(ranges, start, end)) {
                                proofRanges.push({ start, end, widget: new EndProofWidget(plugin, profile) });
                            }
                        }
                    }
                });
            }
            addRawProofLineDecorations(view, settings, profile, ranges, sourcePath, plugin, proofRanges);
            proofRanges.sort((a, b) => a.start - b.start || a.end - b.end);
            let lastEnd = -1;
            for (const proofRange of proofRanges) {
                if (proofRange.start < lastEnd) continue;
                builder.add(
                    proofRange.start,
                    proofRange.end,
                    Decoration.replace({
                        widget: proofRange.widget
                    })
                );
                lastEnd = proofRange.end;
            }
            return builder.finish();
        }
    }, {
    decorations: instance => instance.decorations
});

function addRawProofLineDecorations(
    view: EditorView,
    settings: ReturnType<typeof resolveSettings>,
    profile: Profile,
    ranges: readonly SelectionRange[],
    sourcePath: string,
    plugin: LatexReferencer,
    proofRanges: { start: number, end: number, widget: BeginProofWidget | EndProofWidget }[]
) {
    const { state } = view;
    for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
            const line = state.doc.lineAt(pos);
            const text = line.text.trim();
            const parsed = parseProofText(text, settings);
            if (parsed) {
                const start = line.from + line.text.indexOf(text);
                const end = start + text.length;
                if (!rangesHaveOverlap(ranges, start, end)) {
                    proofRanges.push({
                        start,
                        end,
                        widget: parsed.which === "begin" ? new BeginProofWidget(plugin, profile, parsed.display, parsed.linktext, sourcePath) : new EndProofWidget(plugin, profile)
                    });
                }
            }
            if (line.to >= to) break;
            pos = line.to + 1;
        }
    }
}

// export const proofFoldFactory = (plugin: LatexReferencer) => foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
//     const positions = state.field(plugin.proofPositionField);
//     for (const pos of positions) {
//         if (pos.begin && pos.end && lineStart <= pos.begin.from && pos.begin.to <= lineEnd) {
//             return { from: pos.begin.to, to: pos.end.to };
//         }
//     }
//     return null;
// });
