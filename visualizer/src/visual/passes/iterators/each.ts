import { StateViewIterator } from "@app/visual/passes/iterators/iterator";
import { RendererInternalState } from "@app/visual/passes";
import {
    ReactFlowGraph,
    BoxNode, ContainerNode,
    BoxNodeData, ContainerNodeData,
} from "@app/visual/types";

export class EachIterator extends StateViewIterator {
    public static traverse(
        istat: RendererInternalState,
        graph: ReactFlowGraph,
        fnBox: (data: BoxNodeData) => BoxNodeData,
        fnContainer: (data: ContainerNodeData) => ContainerNodeData,
        roots?: string[]
    ): void {
        const iterator = new EachIterator(istat, graph, fnBox, fnContainer, roots);
        iterator.traverse();
    }
    public traverse() {
        const getUpdatedNode = (node: BoxNode | ContainerNode) => {
            if (node.type == 'box') {
                return {
                    ...node,
                    data: this.traverseBox(node.data)
                }
            } else if (node.type == 'container') {
                return {
                    ...node,
                    data: this.traverseContainer(node.data)
                }
            }
            return { ...node };
        };
        this.graph.nodes = this.graph.nodes.map(node => {
            const updatedNode = getUpdatedNode(node);
            this.istat.nodeMap[node.id] = updatedNode;
            return updatedNode;
        });
    }
    private traverseBox(data: BoxNodeData) {
        let updatedData = { ...this.fnBox(data) };
        for (let [label, member] of Object.entries(data.members)) {
            if (member.class == 'box') {
                updatedData.members[label] = {
                    ...member,
                    data: this.traverseBox(member.data)
                };
            }
        }
        this.istat.boxNodeDataMap[data.key] = updatedData;
        return updatedData;
    }
    private traverseContainer(data: ContainerNodeData) {
        return { ...this.fnContainer(data) }
    }
}
