import { ReactFlowGraph } from "@app/visual/types";
import { RendererInternalState, RefresherPass } from "@app/visual/passes";
import { SubtreeIterator } from "@app/visual/passes/iterators";

export class ClickTrimRefresher extends RefresherPass {
    public static render(
        istat: RendererInternalState, graph: ReactFlowGraph,
        id: string, rootId: string, attr: string
    ): ReactFlowGraph {
        const handler = new ClickTrimRefresher(istat, graph, id, rootId, attr);
        return handler.render();
    }
    public render(): ReactFlowGraph {
        if (this.updAttr != 'trimmed') {
            return this.graph;
        }
        console.log('ClickTrimRefresher.render()');
        let trimmed: boolean | undefined = undefined;
        if (this.istat.hasNode(this.updId)) {
            let node = this.istat.getNode(this.updId);
            trimmed = node.data.trimmed;
        } else {
            let boxNodeData = this.istat.getBoxNodeData(this.updId);
            trimmed = boxNodeData.trimmed;
        }
        SubtreeIterator.traverse(this.istat, this.graph,
            (data) => {
                data.trimmed = !trimmed;
                return data;
            },
            (data) => {
                data.trimmed = !trimmed;
                return data;
            },
            [this.updId]
        );
        return this.graph;
    }
}
