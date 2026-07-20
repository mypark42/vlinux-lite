import {
    ReactFlowGraph, BoxNode, ContainerNode,
    BoxNodeData,
} from "@app/visual/types";
import { RendererInternalState, RendererPass } from "@app/visual/passes";
import { type Node, type Edge } from "@xyflow/react";
import Dagre, { layout } from "@dagrejs/dagre";
import layoutDagreWrapper from "@app/visual/dagre";

import * as sc from "@app/visual/nodes/styleconf";

export class Layouter extends RendererPass {
    public static render(istat: RendererInternalState, graph: ReactFlowGraph): ReactFlowGraph {
        const layouter = new Layouter(istat, graph);
        return layouter.render();
    }
    public render() {
        this.layout();
        return this.graph;
    }
    private layout(): ReactFlowGraph {
        //
        for (const node of this.graph.nodes) {
            if (node.type == 'box' || node.type == 'container') {
                node.width = undefined;
                node.height = undefined;
            }
        }
        //
        this.estimateNodeSize();
        this.layoutOutmostNodes();
        // // eliminate estimation errors
        // for (const node of this.graph.nodes) {
        //     if (node.type == 'box') {
        //         // node.height = undefined;
        //     }
        // }
        //
        for (const node of this.graph.nodes) {
            if ((node.type == 'box' || node.type == 'container') && node.data.trimmed) {
                node.width = 1;
                node.height = 1;
                node.position.x = 0;
                node.position.y = 0;
            }
        }
        // return
        console.log('final graph', this.graph);
        return this.graph;
    }
    private estimateNodeSize() {
        // estimate the node size for layout
        for (const node of this.graph.nodes) {
            if (node.type == 'box') {
                this.estimateBoxNodeSize(node, 0);
            } else if (node.type == 'container') {
                this.estimateContainerNodeSize(node, 0);
            }
        }
    }
    //
    // post process functions
    //
    private estimateBoxNodeSize(node: BoxNode, depth: number, isParentCollapsed: boolean = false) {
        // avoid redundant estimation
        if (node.width !== undefined) {
            return;
        }
        // estimate the width
        let width = sc.boxNodeWidth;
        // estimate the height according to the height of its members
        let height = this._estimateBoxNodeHeight(node.data, depth, isParentCollapsed);
        // return
        if (node.data.trimmed) {
            node.width  = 0;
            node.height = 0;
            return;
        }
        node.width  = width;
        node.height = height;
    }
    private _estimateBoxNodeHeight(nodeData: BoxNodeData, depth: number, isParentCollapsed: boolean) {
        // basic height: space for the label at the top and object address at the bottom
        let height = 52;
        // count the height of each member
        let members = Object.entries(nodeData.members);
        for (let index = 0; index < members.length; index++) {
            const [label, member] = members[index];
            // estimation for primitive members
            if (member.class === "text" || member.class === "link") {
                let value;
                if (member.class === "text") {
                    value = member.value;
                } else {
                    value = member.target?.split(':')[0] || "null";
                }
                const { labelLines, valueLines } = sc.TextFieldAdaption(label, value, depth);
                height += 2 * sc.textPadding;
                height += 18 * Math.max(labelLines.length, valueLines.length);
                continue;
            }
            // handle non-primitive, i.e, box members
            if (member.data === undefined) {
                console.error(`memberNode is undefined: ${member.object}`);
                continue;
            }
            // estimate the member node size first
            let memberHeight = this._estimateBoxNodeHeight(member.data, depth + 1, isParentCollapsed || nodeData.collapsed === true);
            // add necessary spaces to estimate the node size (except for trimmed members)
            if (memberHeight > 0) {
                let space = memberHeight + 8;
                if (index > 0 && members[index - 1][1].class === 'box') {
                    space -= 3;
                }
                // finally estimated
                height += space;
            }
        }
        // return
        if (isParentCollapsed) {
            return sc.boxNodeHeightCollapsed;
        }
        if (nodeData.collapsed) {
            return sc.boxNodeHeightCollapsed;
        }
        if (nodeData.trimmed) {
            return 0;
        }
        return height;
    }
    private estimateContainerNodeSize(node: ContainerNode, depth: number, isParentCollapsed: boolean = false) {
        // handle members one by one
        let memberNodes: (BoxNode | ContainerNode)[] = [];
        let memberEdges: Edge[] = [];
        for (const member of node.data.members) {
            const memberNode = this.graph.nodes.find(n => n.id === member.key);
            if (memberNode === undefined) {
                throw new Error(`memberNode not found: ${member.key}`);
            }
            // estimate the member size first
            if (memberNode.type == 'box') {
                this.estimateBoxNodeSize(memberNode, depth, isParentCollapsed || node.data.collapsed);
            } else if (memberNode.type == 'container') {
                this.estimateContainerNodeSize(memberNode, depth + 1, isParentCollapsed || node.data.collapsed);
            }
            // prepare the subgraph for subflow layout
            memberNodes.push(memberNode);
            for (const [label, link] of Object.entries(member.links)) {
                if (member.key == null) {
                    continue;
                }
                if (link.target !== null) {
                    memberEdges.push({
                        id: `${member.key}.${label}`,
                        source: member.key,
                        target: link.target,
                    });
                }
            }
        }
        // return if parent collapsed
        if (isParentCollapsed || node.data.trimmed) {
            node.width  = 0;
            node.height = 0;
            return;
        }
        // init for the subflow layout
        let layoutOptions: Dagre.GraphLabel = {
            // rankdir: this.layoutDirection
            rankdir: node.data.direction == 'vertical' ? 'TB' : 'LR',
        };
        layoutOptions.marginx = 16;
        layoutOptions.marginy = 16;
        // if (node.id.split(':')[1].endsWith('[Array]')) {
        //     layoutOptions.marginx = 4;
        //     layoutOptions.marginy = 4;
        //     layoutOptions.nodesep = 4;
        //     memberNodes.forEach(memberNode => memberNode.draggable = false);
        // } else {
        //     layoutOptions.marginx = 16;
        //     layoutOptions.marginy = 16;
        // }
        // do not need subflow layout if collapsed
        if (node.data.collapsed) {
            node.width  = sc.boxNodeWidth + layoutOptions.marginx * 2;
            node.height = sc.boxNodeHeightCollapsed;
            for (const memberNode of memberNodes) {
                if (memberNode.width === undefined || memberNode.height === undefined) {
                    throw new Error(`memberNode.width/height should not be undefined here: ${memberNode.id}`);
                }
                memberNode.position.x = (node.width - memberNode.width);
                memberNode.position.y = (node.height - memberNode.height) / 2;
            }
            return;
        }
        // remove trimmed subgraph
        memberEdges = memberEdges.filter(edge => 
            !memberNodes.find(n => n.id == edge.source)?.data.trimmed && 
            !memberNodes.find(n => n.id == edge.target)?.data.trimmed
        );
        memberNodes = memberNodes.filter(node => !node.data.trimmed);
        // perform the subflow layout
        let hdrOffsetY = 32 - layoutOptions.marginy;
        this.layoutGraphByDagre(memberNodes, memberEdges, layoutOptions, []);//[memberNodes[0].id]);
        // left spaces for the node header
        memberNodes.forEach(memberNode => memberNode.position.y += hdrOffsetY);
        // estimate the container size according to the layouted subflow graph
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const memberNode of memberNodes) {
            if (memberNode.width === undefined || memberNode.height === undefined) {
                throw new Error(`memberNode.width/height should not be undefined here: ${memberNode.id}`);
            }
            const x = memberNode.position.x;
            const y = memberNode.position.y;
            const w = memberNode.width;
            const h = memberNode.height;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + w);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y + h);
        }
        if (memberNodes.length == 0) {
            minX = 0; maxX = 0;
            minY = 0; maxY = 0;
        }
        const width  = maxX - minX + 2 * layoutOptions.marginx;
        const height = maxY - minY + 2 * layoutOptions.marginy + hdrOffsetY;
        // return
        node.width  = width;
        node.height = height;
    }
    // layout the rest, i.e., outermost nodes
    private layoutOutmostNodes() {
        let nodes = this.graph.nodes.filter(node => node.parentId === undefined);
        // edges must be converted to outermost-to-outermost edges for the dagre layout to work correctly
        let getRoot = (key: string) => {
            let node = this.graph.nodes.find(n => n.id === key);
            if (node === undefined) {
                throw new Error(`node not found for key ${key}`);
            }
            while (node.parentId !== undefined) {
                const parentId: string = node.parentId;
                node = this.graph.nodes.find(n => n.id === parentId);
                if (node === undefined) {
                    throw new Error(`node not found for key ${parentId}`);
                }
            }
            return node.id;
        }
        let edges = this.graph.edges.map(edge => ({
            ...edge,
            source: getRoot(edge.source),
            target: getRoot(edge.target),
        }));
        let layoutOptions: Dagre.GraphLabel = {
            rankdir: 'LR', ranksep: 64,
            marginx: 16, marginy: 16,
        };
        this.layoutGraphByDagre(nodes, edges, layoutOptions, this.istat.view.plot);
    }
    private layoutGraphByDagre(nodes: Node[], edges: Edge[], graphOptions: Dagre.GraphLabel, rootNodes: string[]) {
        // Add Object.hasOwn polyfill for es2022 compatibility of @dagrejs/graphlib
        if (!Object.hasOwn) Object.hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        console.log('layoutGraphByDagre', this.istat.view.name, this.istat.view.is_diff);

        // layout the graph by dagre
        const nodeRank = this.calcNodeRank(nodes, edges, rootNodes);
        const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
        g.setGraph(graphOptions);
        edges.forEach((edge) => g.setEdge(edge.source, edge.target));
        nodes.forEach((node) => g.setNode(node.id, { width: node.width, height: node.height, rank: nodeRank[node.id] }));
        const layoutOptions: Dagre.configUnion = {
            disableOptimalOrderHeuristic: true
        }
        layout(g, layoutOptions);
        // if (this.istat.view.is_diff) {
        //     layout(g, layoutOptions);
        // } else {
        //     layoutDagreWrapper(g as any, layoutOptions);
        // }

        // convert positions from dagre to react flow
        for (let node of nodes) {
            const position = g.node(node.id);
            const x = position.x - (node.width ?? 0) / 2;
            const y = position.y - (node.height ?? 0) / 2;
            node.position = { x, y };
        }

        // group nodes by rank
        const nodesByRank: {[key: number]: Node[]} = {};
        for (let node of nodes) {
            const rank = g.node(node.id).rank ?? 0;
            if (!nodesByRank[rank]) {
                nodesByRank[rank] = [];
            }
            nodesByRank[rank].push(node);
        }
        // make nodes with the same rank aligned
        for (let rank in nodesByRank) {
            const rankNodes = nodesByRank[rank];
            if (graphOptions.rankdir == 'LR') {
                let minX = Math.min(...rankNodes.map(node => node.position.x));
                for (let node of rankNodes) {
                    node.position.x = minX;
                }
            } else {
                let minY = Math.min(...rankNodes.map(node => node.position.y));
                for (let node of rankNodes) {
                    node.position.y = minY;
                }
            }
        }
    }
    //
    private calcNodeRank(nodes: Node[], edges: Edge[], rootNodes: string[]) {
        // init
        let nodeRank: {[key: string]: number} = {};
        let edgeMap: {[key: string]: Edge[]} = {};
        for (const edge of edges) {
            if (!edgeMap[edge.source]) {
                edgeMap[edge.source] = [];
            }
            edgeMap[edge.source].push(edge);
        }
        // if rootNodes not set, find no-prev ones
        if (rootNodes.length == 0) {
            rootNodes = nodes
                .filter(node => edges.find(edge => edge.target == node.id) === undefined)
                .map(node => node.id);
            if (rootNodes.length == 0) {
                for (const node of nodes) {
                    nodeRank[node.id] = 0;
                }
                return nodeRank;
            }
        }
        // calculate the rank for each node
        let nodeVisited: {[key: string]: boolean} = {};
        for (const nodeKey of rootNodes) {
            nodeVisited[nodeKey] = true;
            nodeRank[nodeKey] = 0;
            this.dfsCalcNodeRank(nodeKey, edgeMap, nodeVisited, nodeRank);
        }
        // return
        return nodeRank;
    }
    private dfsCalcNodeRank(
        nodeKey: string, edgeMap: {[key: string]: Edge[]},
        nodeVisited: {[key: string]: boolean}, nodeRank: {[key: string]: number}
    ) {
        const edges = edgeMap[nodeKey] || [];
        for (const edge of edges) {
            if (nodeVisited[edge.target]) {
                continue;
            }
            if (nodeKey != edge.source) {
                throw new Error(`nodeKey != edge.source: ${nodeKey} != ${edge.source}`);
            }
            nodeVisited[edge.target] = true;
            const node = this.istat.getNode(nodeKey);
            const targetNode = this.istat.getNode(edge.target);
            // ensure the correct rank of container nodes
            if (isSameParent(node, targetNode)) {
                nodeVisited[node.parentId] = true;
                nodeRank[node.parentId] = nodeRank[nodeKey];
                this.dfsCalcNodeRank(node.parentId, edgeMap, nodeVisited, nodeRank);
            }
            nodeRank[edge.target] = nodeRank[nodeKey] + 2;
            if (nodeKey.startsWith('0xffff888005aeb800')) {
                nodeRank[edge.target] -= 2;
            }
            this.dfsCalcNodeRank(edge.target, edgeMap, nodeVisited, nodeRank);
        }
    }
}

function hasParent(node: Node) {
    return node.parentId !== undefined;
}
function isSameParent(node1: Node, node2: Node): node1 is (Node & { parentId: string }) {
    if (!hasParent(node1) || !hasParent(node2)) {
        return false;
    }
    return node1.parentId == node2.parentId;
}
