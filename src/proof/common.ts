import { Profile } from "settings/profile";
import { MathContextSettings } from "settings/settings";

export function parseProofText(text: string, settings: Required<Pick<MathContextSettings, "beginProof" | "endProof">>): { which: "begin" | "end", display: string | null, linktext: string | null } | null {
    if (text.startsWith(settings.beginProof)) {
        const rest = text.slice(settings.beginProof.length);
        if (!rest) {
            return { which: "begin", display: null, linktext: null };
        }
        const displayMatch = rest.match(/^\[(.*)\]$/);
        if (displayMatch) {
            return { which: "begin", display: displayMatch[1], linktext: null };
        }
        const linkMatch = rest.match(/^@\[\[(.*)\]\]$/);
        if (linkMatch) {
            return { which: "begin", display: null, linktext: linkMatch[1] };
        }
    } else if (text === settings.endProof) {
        return { which: "end", display: null, linktext: null };
    }
    return null;
}

export function makeProofClasses(which: "begin" | "end", profile: Profile) {
    return [
        "math-booster-" + which + "-proof", // deprecated
        "latex-referencer-" + which + "-proof",
        ...profile.meta.tags.map((tag) => "math-booster-" + which + "-proof-" + tag), // deprecated
        ...profile.meta.tags.map((tag) => "latex-referencer-" + which + "-proof-" + tag)
    ];
}

export function makeProofElement(which: "begin" | "end", profile: Profile) {
    return createSpan({
        text: profile.body.proof[which],
        cls: makeProofClasses(which, profile)
    })
}
