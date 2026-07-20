import { Edge } from "@dagrejs/dagre";
import { applyWithChunking } from "@dagrejs/dagre/lib/util";

export function longestPath(g: DagreGraph) {
    let visited: Record<string, boolean> = {};

    function dfs(v: string) {
        const label = g.node(v);
        if (Object.hasOwn(visited, v)) {
            return label.rank;
        }
        visited[v] = true;

        let outEdgesMinLens = g.outEdges(v)?.map((e: Edge) => {
            if (e == null) {
                return Number.POSITIVE_INFINITY;
            }
            return dfs(e.w) - g.edge(e).minlen;
        }) ?? [];

        var rank = applyWithChunking(Math.min, outEdgesMinLens);
        if (rank === Number.POSITIVE_INFINITY) {
            rank = 0;
        }
        // [layout] modified: support predefined rank
        if (label.rank === undefined) {
            label.rank = rank;
        }
        return label.rank;
    }
    g.sources().forEach(dfs);
}

export function slack(g: DagreGraph, e: Edge) {
    return g.node(e.w).rank - g.node(e.v).rank - g.edge(e).minlen;
}
