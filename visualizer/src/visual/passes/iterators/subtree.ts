import { StateViewIterator } from "@app/visual/passes/iterators/iterator";
import { RendererInternalState } from "@app/visual/passes";
import { ReactFlowGraph, BoxNodeData, ContainerNodeData, BoxNode, ContainerNode } from "@app/visual/types";

export class SubtreeIterator extends StateViewIterator {
    public static traverse(
        istat: RendererInternalState,
        graph: ReactFlowGraph,
        fnBox: (data: BoxNodeData) => BoxNodeData,
        fnContainer: (data: ContainerNodeData) => ContainerNodeData,
        roots?: string[]
    ): void {
        const iterator = new SubtreeIterator(istat, graph, fnBox, fnContainer, roots);
        iterator.traverse();
    }
    private rootSet: Set<string> = new Set();
    public traverse() {
        for (let root of this.roots) {
            this.rootSet.add(root);
        }
        // iterate twice to avoid multi-path-reachable should-be-trimmed nodes
        // being visited before touched from trimmed ancestors
        for (let node of this.graph.nodes) {
            if (this.rootSet.has(node.id)) {
                this.traverseNode(node, true);
            }
        }
        for (let node of this.graph.nodes) {
            this.traverseNode(node, false);
        }
    }
    private traverseNode(node: BoxNode | ContainerNode, isInSubtree: boolean) {
        if (node.type == 'box') {
            this.traverseBox(node.data, isInSubtree);
        } else if (node.type == 'container') {
            this.traverseContainer(node.data, isInSubtree);
        }
    }
    private traverseBox(data: BoxNodeData, isInSubtree: boolean) {
        if (this.visited.has(data.key)) {
            return;
        }
        this.visited.add(data.key);
        if (this.rootSet.has(data.key)) {
            isInSubtree = true;
        }
        if (isInSubtree) {
            this.fnBox(data);
        }
        for (let member of Object.values(data.members)) {
            let succKey: string | undefined;
            if (member.class == 'box') {
                succKey = member.object;
            } else if (member.class == 'link' && member.target !== null) {
                succKey = member.target;
            }
            if (succKey !== undefined && succKey !== '(empty)') {
                let succNode = this.istat.getNode(succKey);
                if (succNode !== undefined) {
                    this.traverseNode(succNode, isInSubtree);
                } else {
                    let succNodeData = this.istat.getBoxNodeData(succKey);
                    if (succNodeData !== undefined) {
                        this.traverseBox(succNodeData, isInSubtree);
                    } else {
                        throw new Error(`SubtreeIterator: succ node/nodedata ${succKey} not found`);
                    }
                }
            }
        }
    }
    private traverseContainer(data: ContainerNodeData, isInSubtree: boolean) {
        if (this.visited.has(data.key)) {
            return;
        }
        this.visited.add(data.key);
        if (this.rootSet.has(data.key)) {
            isInSubtree = true;
        }
        if (isInSubtree) {
            this.fnContainer(data);
        }
        for (let member of data.members) {
            if (member.key !== null) {
                this.traverseNode(this.istat.getNode(member.key), isInSubtree);
            }
        }
    }
}
