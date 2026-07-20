import { ReactFlowGraph, BoxNodeData, ContainerNode } from "@app/visual/types";
import { RendererInternalState, RendererPass } from "@app/visual/passes";

// a special pass that performs some breaking changes for final optimization
export class Finalizer extends RendererPass {
    public static render(istat: RendererInternalState, graph: ReactFlowGraph): ReactFlowGraph {
        const finalizer = new Finalizer(istat, graph);
        return finalizer.render();
    }
    private finalGraph!: ReactFlowGraph;
    private trimmedNodes!: Set<string>;
    public render() {
        this.finalGraph = {
            nodes: this.graph.nodes.map(node => ({ ...node })),
            edges: this.graph.edges.map(edge => ({ ...edge })),
        };
        this.trimmedNodes = new Set();
        this.removeTrimmed();
        return this.finalGraph;
    }
    private removeTrimmed() {
        for (const node of this.finalGraph.nodes) {
            if (node.data.trimmed) {
                this.trimmedNodes.add(node.id);
            }
        }
        for (let node of this.finalGraph.nodes) {
            if (node.type == 'box') {
                node.data = this.removeTrimmedBoxNodeData(node.data);
            } else if (node.type == 'container') {
                node.data = { ...node.data };
                node.data.members = node.data.members.filter(member => member.key !== null && !this.trimmedNodes.has(member.key));
                this.removeTrimmedContainerMembers(node, this.trimmedNodes);
            }
        }
        this.finalGraph.nodes = this.finalGraph.nodes.filter(node => {
            return !node.data.trimmed;
        });
        this.finalGraph.edges = this.finalGraph.edges.filter(edge => {
            const source = this.istat.getNode(edge.source);
            const target = this.istat.getNode(edge.target);
            if (!source || !target) return false;
            return !source.data.trimmed && !target.data.trimmed;
        });
    }
    private removeTrimmedBoxNodeData(nodeData: BoxNodeData) {
        nodeData = { ...nodeData };
        nodeData.members = { ...nodeData.members };
        for (let label in nodeData.members) {
            let member = nodeData.members[label];
            if (member.class == 'link' && member.target !== null && this.trimmedNodes.has(member.target)) {
                nodeData.members[label] = { ...nodeData.members[label] };
                member = nodeData.members[label];
                if (member.class === 'link') {
                    member.isTargetTrimmed = true;
                }
            } else if (member.class == 'box') {
                nodeData.members[label] = { ...nodeData.members[label] };
                member = nodeData.members[label];
                if (member.class === 'box') {
                    member.data = this.removeTrimmedBoxNodeData(member.data);
                }
            }
        }
        return nodeData;
    }
    private removeTrimmedContainerMembers(node: ContainerNode, trimmedNodes: Set<string>) {
        if (node.data.trimmed) {
            for (let member of node.data.members) {
                if (member.key !== null && !trimmedNodes.has(member.key)) {
                    let memberNode = this.istat.getNode(member.key);
                    memberNode.data.trimmed = true;
                    if (memberNode.type == 'container') {
                        this.removeTrimmedContainerMembers(memberNode, trimmedNodes);
                    }
                }
            }
        }
    }
}
