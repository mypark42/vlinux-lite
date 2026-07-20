import { ReactFlowGraph, ContainerNode } from "@app/visual/types";
import { RendererInternalState, RefresherPass } from "@app/visual/passes";
import { EachIterator } from "@app/visual/passes/iterators";

export class ClickCollapseRefresher extends RefresherPass {
    public static render(
        istat: RendererInternalState, graph: ReactFlowGraph,
        id: string, rootId: string, attr: string
    ): ReactFlowGraph {
        const handler = new ClickCollapseRefresher(istat, graph, id, rootId, attr);
        return handler.render();
    }
    public render(): ReactFlowGraph {
        if (this.updAttr != 'collapsed') {
            return this.graph;
        }
        console.log('ClickCollapseHandler.render()');
        EachIterator.traverse(this.istat, this.graph, 
            (data) => {
                if (data.key == this.updId) {
                    data.collapsed = !data.collapsed;
                }
                return data;
            },
            (data) => {
                if (data.key == this.updId) {
                    data.collapsed = !data.collapsed;
                    this.renderContainer(data.key);
                }
                return data;
            },
        );
        return this.graph;
    }
    private renderContainer(id: string) {
        let node = this.istat.getNode(id) as ContainerNode;
        let memberKeys = new Set<string>();
        for (const member of node.data.members) {
            if (member.key !== null) {
                memberKeys.add(member.key);
            }
        }
        EachIterator.traverse(this.istat, this.graph, 
            (data) => {
                if (memberKeys.has(data.key)) {
                    data.parentCollapsed = node.data.collapsed;
                }
                return data;
            },
            (data) => data,
        );
        this.graph.edges = this.graph.edges.map(edge => {
            if (memberKeys.has(edge.source) && memberKeys.has(edge.target)) {
                return { ...edge, hidden: node.data.collapsed };
            }
            return { ...edge };
        });
        return this.graph;
    }
}

