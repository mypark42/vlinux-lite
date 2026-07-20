import {
    StateView, ViewAttrs,
    ReactFlowGraph,
} from "@app/visual/types";
import { Converter } from "@app/visual/converter";
import {
    RendererInternalState,
    Reorder,
    AttrSetter,
    ClickCollapseRefresher, ClickTrimRefresher,
    Finalizer, Layouter
} from "@app/visual/passes";

export class Renderer {
    private state: RendererInternalState;
    private graph: ReactFlowGraph;
    constructor(view: StateView | null, attrs: ViewAttrs) {
        this.state = {} as RendererInternalState;
        this.graph = { nodes: [], edges: [] };
        this.reset(view, attrs);
    }
    public reset(view: StateView | null, attrs: ViewAttrs) {
        if (view != null) {
            this.state = new RendererInternalState(view, attrs);
            this.graph = Converter.convert(this.state);
        }
    }
    public create() {
        for (const Pass of [Reorder, AttrSetter]) {
            this.graph = Pass.render(this.state, this.graph);
        }
        return this.graph;
    }
    public refresh(id: string, rootId: string, type: string) {
        for (const Pass of [ClickCollapseRefresher, ClickTrimRefresher]) {
            this.graph = Pass.render(this.state, this.graph, id, rootId, type);
        }
        return this.graph;
    }
    public finalize() {
        let graph = Finalizer.render(this.state, this.graph);
        graph = Layouter.render(this.state, graph);
        return graph;
    }
}
