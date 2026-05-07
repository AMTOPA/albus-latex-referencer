import { StateField, EditorState, Transaction, RangeSet, RangeValue, Range, Text } from '@codemirror/state';

import LatexReferencer from 'main';
import { readTheoremCalloutSettings } from 'utils/parse';
import { resolveSettings } from 'utils/plugin';
import { editorInfoField } from 'obsidian';
import { getLatexTheoremEnvironmentEnd, getMarkdownFenceLineIndexes, parseLatexTheoremBeginLine } from './latex-environment';

export const CALLOUT = /HyperMD-callout_HyperMD-quote_HyperMD-quote-([1-9][0-9]*)/;

export class TheoremCalloutInfo extends RangeValue {
    constructor(
        public index: number | null,
        public sectionIndex?: number // For detailed numbering mode
    ) {
        super();
    }
}


export const createTheoremCalloutsField = (plugin: LatexReferencer) => StateField.define<RangeSet<TheoremCalloutInfo>>({
    create(state: EditorState) {
        // Since because canvas files cannot be indexed currently,
        // do not number theorems in canvas to make live preview consistent with reading view
        if (!state.field(editorInfoField).file) return RangeSet.empty;

        const ranges = getTheoremCalloutInfos(plugin, state, state.doc, 0, 0);
        return RangeSet.of(ranges);
    },
    update(value: RangeSet<TheoremCalloutInfo>, tr: Transaction) {
        // Since because canvas files cannot be indexed currently,
        // do not number theorems in canvas to make live preview consistent with reading view
        if (!tr.state.field(editorInfoField).file) return RangeSet.empty;

        // Because the field can be perfectly determined by the document content, 
        // we don't need to update it when the document is not changed
        if (!tr.docChanged) return value;

        return RangeSet.of(getTheoremCalloutInfos(plugin, tr.state, tr.newDoc, 0, 0));
    }
});


function getTheoremCalloutInfos(plugin: LatexReferencer, state: EditorState, doc: Text, from: number, init: number): Range<TheoremCalloutInfo>[] {
    const ranges: Range<TheoremCalloutInfo>[] = [];
    const file = state.field(editorInfoField).file;
    if (!file) return ranges;

    const settings = resolveSettings(undefined, plugin, file);
    const numberingMode = settings.numberingMode || 'unified';

    // For separate numbering: maintain counters per type
    const separateCounters: Record<string, number> = {};
    
    // For detailed numbering: get h1 headings and maintain counters per section and type
    const h1Headings = numberingMode === 'detailed'
        ? (plugin.app.metadataCache.getFileCache(file)?.headings?.filter(h => h.level === 1) || [])
        : [];
    const detailedCounters: Record<number, Record<string, number>> = {};

    // Helper function to find which h1 section a line belongs to
    const getH1SectionIndex = (lineNumber: number): number => {
        if (h1Headings.length === 0) return 0;
        for (let i = h1Headings.length - 1; i >= 0; i--) {
            if (lineNumber >= h1Headings[i].position.start.line) {
                return i + 1; // Section numbers start from 1
            }
        }
        return 0; // Before the first h1
    };

    let unifiedIndex = init; // For unified numbering mode

    const lines: string[] = [];
    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
        lines.push(doc.line(lineNumber).text);
    }
    const fencedLineIndexes = getMarkdownFenceLineIndexes(lines);

    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
        if (fencedLineIndexes.has(lineNumber - 1)) continue;
        const line = doc.line(lineNumber);
        const calloutSettings = readTheoremCalloutSettings(line.text, plugin.extraSettings.excludeExampleCallout);
        const begin = parseLatexTheoremBeginLine(line.text);
        const currentSettings = calloutSettings ?? begin;
        if (!currentSettings) continue;

        let theoremIndex: number | null = null;
        let sectionIndex: number | undefined = undefined;

        if (currentSettings.number === 'auto') {
            const type = currentSettings.type;

            if (numberingMode === 'detailed') {
                const line = lineNumber - 1;
                sectionIndex = getH1SectionIndex(line);
                
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

        if (calloutSettings) {
            const value = new TheoremCalloutInfo(theoremIndex, sectionIndex);
            ranges.push(value.range(line.from, line.to));
        }
        if (begin) {
            const endIndex = getLatexTheoremEnvironmentEnd(lines, lineNumber - 1, begin, fencedLineIndexes);
            if (endIndex !== -1) {
                lineNumber = endIndex;
            }
        }
    }

    return ranges;
}
