import { simplify } from "@dagrejs/dagre/lib/util";
import { longestPath } from "@app/visual/dagre/rank/util";

export default function rank(g: DagreGraph) {
    // [layout] modified
    return networkSimplexRanker(g);
    // switch (g.graph().ranker) {
    // case "network-simplex": networkSimplexRanker(g); break;
    // case "tight-tree": tightTreeRanker(g); break;
    // case "longest-path": longestPathRanker(g); break;
    // default: networkSimplexRanker(g);
    // }
}

function networkSimplexRanker(g: DagreGraph) {
    // [layout] modified
    g = simplify(g);
    longestPath(g);
}
