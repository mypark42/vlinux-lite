import * as util from "@dagrejs/dagre/lib/util";

export default function positionX(g: DagreGraph) {
    let positioner = new XPositioner(g);
    return positioner.position();
}

class XPositioner {
    private graph: DagreGraph;
    private layering: string[][];
    private nodesep: number;
    private parentMap: Map<string, string>;
    private nodePositions: Record<string, number>;
    constructor(g: DagreGraph) {
        this.graph = g;
        this.layering = util.buildLayerMatrix(this.graph);
        this.nodesep = this.graph.graph().nodesep || 32;
        this.parentMap = this.initParentMap();
        this.nodePositions = {};
    }
    initParentMap() {
        const parentMap: Map<string, string> = new Map();
        for (let layerIdx = 2; layerIdx < this.layering.length; layerIdx += 2) {
            const currentLayer = this.layering[layerIdx];
            const previousLayer = this.layering[layerIdx - 2];
            currentLayer.forEach(child => {
                if (child.startsWith('[object Undefined]')) {
                    return;
                }
                let predecessors = (this.graph.predecessors(child) ?? []).flatMap(pred => this.graph.predecessors(pred) ?? []);
                const parentsInPrevLayer = predecessors.filter(p => previousLayer.includes(p));
                if (parentsInPrevLayer.length >= 1) {
                    const parent = parentsInPrevLayer.find(p => !p.startsWith('[object Undefined]')) || parentsInPrevLayer[0];
                    if (!parentMap.has(child)) {
                        parentMap.set(child, parent);
                    }
                }
            });
        }
        return parentMap;
    }
    position() {
        if (this.layering.length > 0) {
            this.positionFirstLayer();
        }
        for (let layerIdx = 1; layerIdx < this.layering.length; layerIdx ++) {
            this.positionSubsequentLayer(layerIdx);
        }
        return this.nodePositions;
    }
    positionFirstLayer() {
        let layer = this.layering[0];
        // TODO: use very big spacing first, and then adjust to minimal spacing across all layers between two subgraphs
        //
        const totalNodeWidth = layer.reduce((sum, node) => sum + this.graph.node(node).width, 0);
        const availLayerCount = layer.reduce((sum, node) => sum + (this.graph.node(node).width > 0 ? 1 : 0), 0);
        const totalSpacing = (availLayerCount - 1) * this.nodesep;
        const totalLayerWidth = totalNodeWidth + totalSpacing;
        // start from the leftmost position to center the layer around origin
        let currentX = -totalLayerWidth / 2;
        // position each node
        layer.forEach(nodeId => {
            const nodeWidth = this.graph.node(nodeId).width;
            this.nodePositions[nodeId] = currentX + nodeWidth / 2;
            currentX += nodeWidth + this.nodesep;
        });
    }
    positionSubsequentLayer(layerIdx: number) {
        const layer = this.layering[layerIdx];
        const parentGroups = this.groupByDirectParent(layer);
        const groupPositions = this.calculateGroupPositions(parentGroups);
        this.resolvePositionConflicts(groupPositions);
        this.applyFinalPositions(groupPositions);
    }
    groupByDirectParent(layer: string[]) {
        const parentGroups: Map<string | undefined, string[]> = new Map();
        layer.forEach(node => {
            const parent = this.parentMap.get(node);
            if (!parentGroups.has(parent)) {
                parentGroups.set(parent, []);
            }
            parentGroups.get(parent)!.push(node);
        });
        return parentGroups;
    }
    calculateGroupPositions(parentGroups: Map<string | undefined, string[]>) {
        const groupPositions: GroupPosition[] = [];
        parentGroups.forEach((children, parent) => {
            if (parent === undefined) {
                children.forEach(child => {
                    groupPositions.push({
                        parent: undefined, node: child, centerX: 0,
                        leftBound: 0, rightBound: 0,
                        width: this.graph.node(child).width,
                        childPositions: [],
                    });
                });
                return;
            }

            if (this.nodePositions[parent] === undefined) {
                return;
            }

            const totalChildWidth = children.reduce((sum, child) => sum + this.graph.node(child).width, 0);
            const childSpacing = (children.length - 1) * this.nodesep;
            const totalGroupWidth = totalChildWidth + childSpacing;

            const childPositions: NodePosition[] = [];
            const groupStartX = this.nodePositions[parent] - totalGroupWidth / 2;
            let currentChildX = groupStartX;
            children.forEach(child => {
                const childWidth = this.graph.node(child).width;
                childPositions.push({
                    key: child,
                    x: currentChildX + childWidth / 2,
                });
                currentChildX += childWidth + this.nodesep;
            });

            groupPositions.push({
                parent: parent, node: parent, centerX: this.nodePositions[parent],
                leftBound: groupStartX, rightBound: groupStartX + totalGroupWidth,
                width: totalGroupWidth,
                childPositions: childPositions,
            });
        });
        return groupPositions;
    }
    resolvePositionConflicts(groupPositions: GroupPosition[]) {
        groupPositions.sort((a, b) => a.centerX - b.centerX);
        for (let i = 0; i < groupPositions.length; i++) {
            const element = groupPositions[i];
            if (element.parent === undefined) {
                const desiredCenter = (i > 0) 
                    ? groupPositions[i - 1].rightBound + this.nodesep + element.width / 2
                    : element.width / 2;
                element.centerX = desiredCenter;
                element.leftBound = desiredCenter - element.width / 2;
                element.rightBound = desiredCenter + element.width / 2;
            }
            if (i > 0) {
                const prevElement = groupPositions[i - 1];
                const minLeft = prevElement.rightBound + this.nodesep;
                if (element.leftBound < minLeft) {
                    const shift = minLeft - element.leftBound;
                    shiftElement(element, shift);
                }
            }
        }
    }
    applyFinalPositions(groupPositions: GroupPosition[]) {
        if (groupPositions.length === 0) return;

        const totalLayerLeft = Math.min(...groupPositions.map(e => e.leftBound));
        const totalLayerRight = Math.max(...groupPositions.map(e => e.rightBound));
        const layerCenter = (totalLayerLeft + totalLayerRight) / 2;
        const centeringShift = -layerCenter;

        groupPositions.forEach(element => {
            if (element.parent !== undefined) {
                element.childPositions.forEach(childPos => {
                    this.nodePositions[childPos.key] = childPos.x + centeringShift;
                });
            } else {
                this.nodePositions[element.node] = element.centerX + centeringShift;
            }
        });
    }
}

type NodePosition = {
    key: string;
    x: number;
}

type GroupPosition = {
    parent: string | undefined;
    node: string;
    centerX: number;
    leftBound: number;
    rightBound: number;
    width: number;
    childPositions: NodePosition[];
}

function shiftElement(element: GroupPosition, shift: number) {
    element.leftBound  += shift;
    element.rightBound += shift;
    element.centerX    += shift;
    if (element.parent !== undefined && element.childPositions) {
        element.childPositions.forEach(childPos => {
            childPos.x += shift;
        });
    }
}
