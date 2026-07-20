// dagre.d.ts
/// <reference types="@dagrejs/dagre" />

// Override incorrect typedecls
declare module '@dagrejs/graphlib' {
    interface Graph {
        parent(childName: string): string | undefined;
        outEdges(v: string, w?: string): Edge[] | undefined;
        predecessors(v: string): string[] | undefined;
    }
}
type DagreGraph = import('@dagrejs/graphlib').Graph;

declare module '@dagrejs/dagre/lib/acyclic' {
    export function run(g: DagreGraph): void;
    export function undo(g: DagreGraph): void;
}

declare module '@dagrejs/dagre/lib/normalize' {
    export function run(g: DagreGraph): void;
    export function undo(g: DagreGraph): void;
}

declare module '@dagrejs/dagre/lib/rank' {
    export default function rank(g: DagreGraph): void;
}

declare module '@dagrejs/dagre/lib/util' {
    export function normalizeRanks(g: DagreGraph): void;
    export function removeEmptyRanks(g: DagreGraph): void;
    export function asNonCompoundGraph(g: DagreGraph): any;
    export function addDummyNode(g: DagreGraph, type: string, attrs: any, name: string): string;
    export function buildLayerMatrix(g: DagreGraph): string[][];
    export function intersectRect(rect: any, point: any): any;
    export function pick(obj: any, keys: string[]): any;
    export function mapValues(obj: any, fn: Function): any;
    export function applyWithChunking(fn: Function, argsArray: any[]): any;
    export function simplify(g: DagreGraph): DagreGraph;
}

declare module '@dagrejs/dagre/lib/parent-dummy-chains' {
    export default function parentDummyChains(g: DagreGraph): void;
}

declare module '@dagrejs/dagre/lib/nesting-graph' {
    export function run(g: DagreGraph): void;
    export function cleanup(g: DagreGraph): void;
}

declare module '@dagrejs/dagre/lib/add-border-segments' {
    export default function addBorderSegments(g: DagreGraph): void;
}

declare module '@dagrejs/dagre/lib/coordinate-system' {
    export function adjust(g: DagreGraph): void;
    export function undo(g: DagreGraph): void;
}

declare module '@dagrejs/dagre/lib/order' {
    export default function order(g: DagreGraph, opts: any): void;
}

declare module '@dagrejs/dagre/lib/position' {
    export default function position(g: DagreGraph): void;
} 