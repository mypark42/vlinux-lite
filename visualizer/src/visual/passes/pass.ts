import {
    StateView, ViewAttrs,
    BoxNode, ContainerNode, BoxNodeData,
    ReactFlowGraph,
} from "@app/visual/types";

// renderer pass
export abstract class RendererPass {
    public static render(_istat: RendererInternalState, _graph: ReactFlowGraph): ReactFlowGraph {
        throw new Error('RendererPass.render() must be implemented by a Pass subclass');
    }
    protected istat: RendererInternalState;
    protected graph: ReactFlowGraph;
    constructor(istat: RendererInternalState, graph: ReactFlowGraph) {
        this.istat = istat;
        this.graph = graph;
    }
    public abstract render(): ReactFlowGraph;
}

export abstract class RefresherPass {
    public static render(
        _istat: RendererInternalState, _graph: ReactFlowGraph,
        _id: string, _rootId: string, _type: string
    ): ReactFlowGraph {
        throw new Error('RefresherPass.render() must be implemented by a Pass subclass');
    }
    protected istat: RendererInternalState;
    protected graph: ReactFlowGraph;
    protected updId:     string;
    protected updRootId: string;
    protected updAttr:   string;
    constructor(
        istat: RendererInternalState, graph: ReactFlowGraph,
        id: string, rootId: string, type: string
    ) {
        this.istat     = istat;
        this.graph     = graph;
        this.updId     = id;
        this.updRootId = rootId;
        this.updAttr   = type;
    }
    public abstract render(): ReactFlowGraph;
}

// internal state across multiple passes during rendering
// maintains metadata for objects in the view
export class RendererInternalState {
    public view:  StateView;
    public attrs: ViewAttrs;
    public rootMap: { [key: string]: string } = {};
    public nodeMap: { [key: string]: BoxNode | ContainerNode } = {};
    public boxNodeDataMap: { [key: string]: BoxNodeData } = {};
    public containerMembers: Set<string> = new Set<string>();
    public loggers: { [name: string]: RendererLogger } = {};
    constructor(view: StateView, attrs: ViewAttrs) {
        this.view  = view;
        this.attrs = attrs;
    }
    public getAttrs(key: string) {
        return this.attrs[key] || {};
    }
    public getShapeView(key: string) {
        if (this.view.hasShape(key)) {
            return this.getAttrs(key).view || 'default';
        }
        throw new Error(`getShapeView: shape ${key} not found`);
    }
    public hasNode(key: string) {
        return key in this.nodeMap;
    }
    public getNode(key: string) {
        return this.nodeMap[key];
    }
    public getBoxNodeData(key: string) {
        return this.boxNodeDataMap[key];
    }
    public isShapeOutmost(key: string) {
        return this.rootMap[key] == key;
    }
    public isShapeContainerMember(key: string) {
        return this.containerMembers.has(key);
    }
    public getLogger(name: string) {
        if (!(name in this.loggers)) {
            this.loggers[name] = new RendererLogger();
        }
        return this.loggers[name];
    }
}

export class RendererLogger {
    public logs: RendererLog[] = [];
    public log(...args: any[]) {
        this.logs.push({ level: 'info', content: args });
    }
    public error(...args: any[]) {
        this.logs.push({ level: 'error', content: args });
    }
}

type RendererLog = {
    level: string;
    content: any[];
}
