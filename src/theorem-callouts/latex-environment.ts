import { MarkdownPostProcessorContext, MarkdownRenderer, TFile, editorInfoField, finishRenderMath } from 'obsidian';
import { RangeSet, RangeSetBuilder, Text } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';

import LatexReferencer from 'main';
import { THEOREM_LIKE_ENV_IDs, THEOREM_LIKE_ENV_ID_PREFIX_MAP, THEOREM_LIKE_ENV_PREFIXES, THEOREM_LIKE_ENV_PREFIX_ID_MAP, TheoremLikeEnvID, TheoremLikeEnvPrefix } from 'env';
import { TheoremCalloutPrivateFields, TheoremCalloutSettings } from 'settings/settings';
import { formatTitleWithoutSubtitle } from 'utils/format';
import { capitalize } from 'utils/general';
import { readTheoremCalloutSettings } from 'utils/parse';
import { renderTextWithMath } from 'utils/render';
import { resolveSettings } from 'utils/plugin';
import { rangesHaveOverlap } from 'utils/editor';

export interface LatexTheoremInfo {
    envName: string;
    type: string;
    number: string;
    title: string;
    label?: string;
}

const LATEX_THEOREM_ENV_ID_MAP: Record<string, string> = {};
THEOREM_LIKE_ENV_IDs.forEach((id) => {
    LATEX_THEOREM_ENV_ID_MAP[id] = id;
});
THEOREM_LIKE_ENV_PREFIXES.forEach((prefix, index) => {
    LATEX_THEOREM_ENV_ID_MAP[prefix] = THEOREM_LIKE_ENV_IDs[index];
});
LATEX_THEOREM_ENV_ID_MAP.math = 'math';

export function normalizeLatexTheoremEnvName(envName: string): { type: string, number: string, envName: string } | null {
    let normalizedName = envName.trim().replace(/^\\/, '').toLowerCase();
    const unnumbered = normalizedName.endsWith('*');
    if (unnumbered) {
        normalizedName = normalizedName.slice(0, -1);
    }
    const type = LATEX_THEOREM_ENV_ID_MAP[normalizedName];
    if (!type) return null;
    return { type, number: unnumbered ? '' : 'auto', envName: normalizedName };
}

export function parseLatexComment(line: string): { nonComment: string, comment: string } {
    const match = line.match(/(?<!\\)%/);
    if (match?.index !== undefined) {
        return { nonComment: line.substring(0, match.index), comment: line.substring(match.index + 1) };
    }
    return { nonComment: line, comment: '' };
}

export function parseLatexTheoremBeginLine(line: string): LatexTheoremInfo | null {
    const labelMatch = line.match(/\\label\{([^}]+)\}/);
    const lineWithoutLabel = line.replace(/\\label\{[^}]+\}/g, '');
    const nonComment = parseLatexComment(lineWithoutLabel).nonComment.trim();
    const match = nonComment.match(/^\\begin\{\\?([A-Za-z][A-Za-z0-9*_-]*)\}(?:\[(.*?)\]|\{(.*?)\})?\s*$/);
    if (!match) return null;
    const normalized = normalizeLatexTheoremEnvName(match[1]);
    if (!normalized) return null;
    return {
        envName: normalized.envName,
        type: normalized.type,
        number: normalized.number,
        title: match[2] ?? match[3] ?? '',
        label: labelMatch?.[1],
    };
}

export function parseLatexTheoremEndLine(line: string): { type: string, number: string, envName: string } | null {
    const nonComment = parseLatexComment(line).nonComment.trim();
    const match = nonComment.match(/^\\end\{\\?([A-Za-z][A-Za-z0-9*_-]*)\}\s*$/);
    if (!match) return null;
    return normalizeLatexTheoremEnvName(match[1]);
}

export function parseLatexLabelLine(line: string): string | undefined {
    return parseLatexComment(line).nonComment.trim().match(/^\\label\{([^}]+)\}$/)?.[1];
}

export function getMarkdownFenceLineIndexes(lines: string[]): Set<number> {
    const indexes = new Set<number>();
    let fence: { char: string, length: number } | null = null;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const match = line.match(/^\s*(`{3,}|~{3,})/);
        if (fence) {
            indexes.add(index);
            if (match && match[1][0] === fence.char && match[1].length >= fence.length) {
                fence = null;
            }
            continue;
        }
        if (match) {
            fence = { char: match[1][0], length: match[1].length };
            indexes.add(index);
        }
    }
    return indexes;
}

export function getLatexTheoremEnvironmentEnd(lines: string[], startIndex: number, beginInfo: LatexTheoremInfo, skippedLineIndexes?: Set<number>): number {
    let depth = 0;
    for (let index = startIndex; index < lines.length; index++) {
        if (skippedLineIndexes?.has(index)) continue;
        const begin = parseLatexTheoremBeginLine(lines[index]);
        if (begin?.type === beginInfo.type) {
            depth++;
        }
        const end = parseLatexTheoremEndLine(lines[index]);
        if (end?.type === beginInfo.type) {
            depth--;
            if (depth === 0) return index;
        }
    }
    return -1;
}

export function getTheoremCalloutMetadataFromLatexInfo(info: LatexTheoremInfo): string {
    return info.number === '' ? '*' : '';
}

export function preprocessLatexTheoremEnvironments(markdown: string, excludeExample = false): string {
    const lines = markdown.split('\n');
    const fencedLineIndexes = getMarkdownFenceLineIndexes(lines);
    const transformed: string[] = [];
    for (let index = 0; index < lines.length; index++) {
        if (fencedLineIndexes.has(index)) {
            transformed.push(lines[index]);
            continue;
        }
        const begin = parseLatexTheoremBeginLine(lines[index]);
        if (!begin) {
            transformed.push(lines[index]);
            continue;
        }
        if (excludeExample && begin.type === 'example') {
            transformed.push(lines[index]);
            continue;
        }
        const endIndex = getLatexTheoremEnvironmentEnd(lines, index, begin, fencedLineIndexes);
        if (endIndex === -1) {
            transformed.push(lines[index]);
            continue;
        }
        const metadata = getTheoremCalloutMetadataFromLatexInfo(begin);
        transformed.push(`> [!${begin.type}${metadata ? '|' + metadata : ''}]${begin.title ? ' ' + begin.title : ''}`);
        if (begin.label) {
            transformed.push(`> %% label: ${begin.label} %%`);
        }
        for (let contentIndex = index + 1; contentIndex < endIndex; contentIndex++) {
            const label = parseLatexLabelLine(lines[contentIndex]);
            transformed.push(label && !fencedLineIndexes.has(contentIndex) ? `> %% label: ${label} %%` : `> ${lines[contentIndex]}`);
        }
        transformed.push('');
        index = endIndex;
    }
    return transformed.join('\n');
}

export function createLatexTheoremCalloutElement(info: LatexTheoremInfo): { calloutEl: HTMLElement, contentEl: HTMLElement, titleInnerEl: HTMLElement } {
    const calloutEl = createDiv({ cls: 'callout' });
    calloutEl.setAttribute('data-callout', info.type);
    calloutEl.setAttribute('data-callout-metadata', getTheoremCalloutMetadataFromLatexInfo(info));
    const titleEl = calloutEl.createDiv({ cls: 'callout-title' });
    titleEl.createDiv({ cls: 'callout-icon' });
    const titleInnerEl = titleEl.createDiv({ cls: 'callout-title-inner' });
    titleInnerEl.setText(info.title ? info.title : capitalize(info.type));
    const contentEl = calloutEl.createDiv({ cls: 'callout-content' });
    return { calloutEl, contentEl, titleInnerEl };
}

export function createLatexTheoremEnvironmentProcessor(plugin: LatexReferencer) {
    return (element: HTMLElement, context: MarkdownPostProcessorContext) => {
        const file = plugin.app.vault.getAbstractFileByPath(context.sourcePath);
        if (!(file instanceof TFile)) return;

        let node = element.firstChild;
        while (node) {
            if (!(node instanceof HTMLElement)) {
                node = node.nextSibling;
                continue;
            }
            if (node.closest('pre')) {
                node = node.nextSibling;
                continue;
            }
            const nodeText = node.textContent || '';
            const paragraphLines = nodeText.split('\n');
            const paragraphBegin = parseLatexTheoremBeginLine(paragraphLines[0] || '');
            if (paragraphBegin && paragraphLines.length > 1) {
                const paragraphEndIndex = getLatexTheoremEnvironmentEnd(paragraphLines, 0, paragraphBegin);
                if (paragraphEndIndex !== -1) {
                    const { calloutEl, contentEl } = createLatexTheoremCalloutElement(paragraphBegin);
                    const content = paragraphLines.slice(1, paragraphEndIndex).filter((line) => !parseLatexLabelLine(line)).join('\n');
                    MarkdownRenderer.renderMarkdown(content, contentEl, context.sourcePath, plugin).then(() => finishRenderMath());
                    node.replaceWith(calloutEl);
                    node = calloutEl.nextSibling;
                    continue;
                }
            }
            const begin = parseLatexTheoremBeginLine(nodeText);
            if (!begin) {
                node = node.nextSibling;
                continue;
            }
            const contentNodes: Node[] = [];
            let depth = 1;
            let endNode: ChildNode | null = null;
            let cursor = node.nextSibling;
            while (cursor) {
                const cursorText = cursor.textContent || '';
                const nestedBegin = parseLatexTheoremBeginLine(cursorText);
                const nestedEnd = parseLatexTheoremEndLine(cursorText);
                if (nestedBegin?.type === begin.type) depth++;
                if (nestedEnd?.type === begin.type) {
                    depth--;
                    if (depth === 0) {
                        endNode = cursor;
                        break;
                    }
                }
                contentNodes.push(cursor);
                cursor = cursor.nextSibling;
            }
            if (!endNode) {
                node = node.nextSibling;
                continue;
            }
            const { calloutEl, contentEl } = createLatexTheoremCalloutElement(begin);
            contentEl.replaceChildren(...contentNodes.filter((child) => !parseLatexLabelLine(child.textContent || '')));
            node.replaceWith(calloutEl);
            endNode.remove();
            node = calloutEl.nextSibling;
        }
    };
}

interface LatexTheoremEnvironmentBlock {
    info: LatexTheoremInfo;
    from: number;
    to: number;
    content: string;
    index: number | null;
    sectionIndex?: number;
}

function getLatexTheoremEnvironmentBlocks(plugin: LatexReferencer, doc: Text, file: TFile): LatexTheoremEnvironmentBlock[] {
    const settings = resolveSettings(undefined, plugin, file);
    const numberingMode = settings.numberingMode || 'unified';
    const separateCounters: Record<string, number> = {};
    const h1Headings = numberingMode === 'detailed'
        ? (plugin.app.metadataCache.getFileCache(file)?.headings?.filter(h => h.level === 1) || [])
        : [];
    const detailedCounters: Record<number, Record<string, number>> = {};
    const blocks: LatexTheoremEnvironmentBlock[] = [];
    const lines: string[] = [];
    for (let i = 1; i <= doc.lines; i++) {
        lines.push(doc.line(i).text);
    }
    const fencedLineIndexes = getMarkdownFenceLineIndexes(lines);
    const getH1SectionIndex = (lineNumber: number): number => {
        if (h1Headings.length === 0) return 0;
        for (let i = h1Headings.length - 1; i >= 0; i--) {
            if (lineNumber >= h1Headings[i].position.start.line) {
                return i + 1;
            }
        }
        return 0;
    };
    let unifiedIndex = 0;
    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
        if (fencedLineIndexes.has(lineNumber - 1)) continue;
        const line = doc.line(lineNumber);
        const text = line.text;
        const calloutSettings = readTheoremCalloutSettings(text, plugin.extraSettings.excludeExampleCallout);
        const begin = parseLatexTheoremBeginLine(text);
        const currentSettings = calloutSettings ?? begin;
        if (!currentSettings) continue;
        let theoremIndex: number | null = null;
        let sectionIndex: number | undefined = undefined;
        if (currentSettings.number === 'auto') {
            const type = currentSettings.type;
            if (numberingMode === 'detailed') {
                sectionIndex = getH1SectionIndex(lineNumber - 1);
                if (!(sectionIndex in detailedCounters)) {
                    detailedCounters[sectionIndex] = {};
                }
                if (!(type in detailedCounters[sectionIndex])) {
                    detailedCounters[sectionIndex][type] = 0;
                }
                theoremIndex = detailedCounters[sectionIndex][type]++;
            } else if (numberingMode === 'separate') {
                if (!(type in separateCounters)) {
                    separateCounters[type] = 0;
                }
                theoremIndex = separateCounters[type]++;
            } else {
                theoremIndex = unifiedIndex++;
            }
        }
        if (!begin) continue;
        const endIndex = getLatexTheoremEnvironmentEnd(lines, lineNumber - 1, begin, fencedLineIndexes);
        if (endIndex === -1) continue;
        const contentLines: string[] = [];
        for (let contentLineNumber = lineNumber + 1; contentLineNumber <= endIndex; contentLineNumber++) {
            const contentLine = doc.line(contentLineNumber).text;
            if (!parseLatexLabelLine(contentLine)) contentLines.push(contentLine);
        }
        blocks.push({
            info: begin,
            from: line.from,
            to: doc.line(endIndex + 1).to,
            content: contentLines.join('\n'),
            index: theoremIndex,
            sectionIndex,
        });
        lineNumber = endIndex;
    }
    return blocks;
}

class LatexTheoremEnvironmentWidget extends WidgetType {
    constructor(private plugin: LatexReferencer, private file: TFile, private block: LatexTheoremEnvironmentBlock) {
        super();
    }

    eq(other: LatexTheoremEnvironmentWidget): boolean {
        return this.file.path === other.file.path
            && this.block.content === other.block.content
            && this.block.info.type === other.block.info.type
            && this.block.info.title === other.block.info.title
            && this.block.index === other.block.index
            && this.block.sectionIndex === other.block.sectionIndex;
    }

    toDOM(): HTMLElement {
        const { calloutEl, contentEl, titleInnerEl } = createLatexTheoremCalloutElement(this.block.info);
        const resolvedSettings = resolveSettings({
            type: this.block.info.type,
            number: this.block.info.number,
            title: this.block.info.title,
            _index: this.block.index ?? undefined,
            _sectionIndex: this.block.sectionIndex,
        } as TheoremCalloutSettings & TheoremCalloutPrivateFields & { _sectionIndex?: number }, this.plugin, this.file);
        const profile = this.plugin.extraSettings.profiles[resolvedSettings.profile];
        calloutEl.classList.add('theorem-callout');
        for (const tag of profile.meta.tags) {
            calloutEl.classList.add('theorem-callout-' + tag);
        }
        calloutEl.classList.add('theorem-callout-' + this.block.info.type);
        if (resolvedSettings.theoremCalloutStyle != 'Custom') {
            calloutEl.classList.add(`theorem-callout-${resolvedSettings.theoremCalloutStyle.toLowerCase()}`);
        }
        if (resolvedSettings.theoremCalloutStyle != 'Custom' && resolvedSettings.theoremCalloutFontInherit) {
            calloutEl.classList.add('theorem-callout-font-family-inherit');
        }
        const mainTitleEl = createSpan({
            text: formatTitleWithoutSubtitle(this.plugin, this.file, resolvedSettings),
            cls: 'theorem-callout-main-title',
        });
        const titleElements: (HTMLElement | string)[] = [mainTitleEl];
        if (resolvedSettings.title) {
            const theoremSubtitleEl = createSpan({ cls: 'theorem-callout-subtitle' });
            theoremSubtitleEl.replaceChildren(...renderTextWithMath(`(${resolvedSettings.title})`));
            titleElements.push(' ', theoremSubtitleEl);
        }
        if (resolvedSettings.titleSuffix) {
            titleElements.push(resolvedSettings.titleSuffix);
        }
        titleInnerEl.replaceChildren(...titleElements);
        MarkdownRenderer.renderMarkdown(this.block.content, contentEl, this.file.path, this.plugin).then(() => finishRenderMath());
        return calloutEl;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

interface LatexTheoremEnvironmentPluginValue extends PluginValue {
    decorations: DecorationSet;
    cachedDoc?: Text;
    cachedFile?: TFile;
    cachedKey?: string;
    cachedBlocks?: LatexTheoremEnvironmentBlock[];
}

export function createLatexTheoremEnvironmentViewPlugin(plugin: LatexReferencer) {
    return ViewPlugin.fromClass(
        class implements LatexTheoremEnvironmentPluginValue {
            decorations: DecorationSet;
            cachedDoc?: Text;
            cachedFile?: TFile;
            cachedKey?: string;
            cachedBlocks?: LatexTheoremEnvironmentBlock[];

            constructor(view: EditorView) {
                this.decorations = this.makeDeco(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged || update.selectionSet) {
                    this.decorations = this.makeDeco(update.view);
                }
            }

            makeDeco(view: EditorView): DecorationSet {
                const file = view.state.field(editorInfoField).file;
                if (!file) return RangeSet.empty;
                const builder = new RangeSetBuilder<Decoration>();
                const ranges = view.state.selection.ranges;
                const blocks = getLatexTheoremEnvironmentBlocksCached(this, plugin, view, file);
                for (const block of blocks) {
                    if (rangesHaveOverlap(ranges, block.from, block.to)) continue;
                    builder.add(
                        block.from,
                        block.to,
                        Decoration.replace({
                            widget: new LatexTheoremEnvironmentWidget(plugin, file, block),
                            block: true,
                        })
                    );
                }
                return builder.finish();
            }
        },
        {
            decorations: instance => instance.decorations,
        }
    );
}

function getLatexTheoremEnvironmentBlocksCached(instance: LatexTheoremEnvironmentPluginValue, plugin: LatexReferencer, view: EditorView, file: TFile): LatexTheoremEnvironmentBlock[] {
    const cacheKey = getLatexTheoremEnvironmentCacheKey(plugin, file);
    if (instance.cachedDoc === view.state.doc && instance.cachedFile === file && instance.cachedKey === cacheKey && instance.cachedBlocks) {
        return instance.cachedBlocks;
    }
    const blocks = getLatexTheoremEnvironmentBlocks(plugin, view.state.doc, file);
    instance.cachedDoc = view.state.doc;
    instance.cachedFile = file;
    instance.cachedKey = cacheKey;
    instance.cachedBlocks = blocks;
    return blocks;
}

function getLatexTheoremEnvironmentCacheKey(plugin: LatexReferencer, file: TFile): string {
    const settings = resolveSettings(undefined, plugin, file);
    const headings = plugin.app.metadataCache.getFileCache(file)?.headings?.filter((h) => h.level === 1).map((h) => `${h.heading}:${h.position.start.line}`).join('|') || '';
    return `${settings.numberingMode || 'unified'}:${plugin.extraSettings.excludeExampleCallout}:${headings}`;
}
