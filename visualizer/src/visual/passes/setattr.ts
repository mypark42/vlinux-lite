import { ReactFlowGraph } from "@app/visual/types";
import { RendererInternalState, RendererPass } from "@app/visual/passes";
import { EachIterator, SubtreeIterator } from "@app/visual/passes/iterators";

export class AttrSetter extends RendererPass {
    public static render(istat: RendererInternalState, graph: ReactFlowGraph): ReactFlowGraph {
        const setter = new AttrSetter(istat, graph);
        return setter.render();
    }
    public render(): ReactFlowGraph {
        console.log('AttrSetter.render()');
        this.setPrimitiveAttrs();
        this.setTrimmed();
        return this.graph;
    }
    private setPrimitiveAttrs() {
        EachIterator.traverse(this.istat, this.graph,
            (data) => {
                const attrs = this.istat.getAttrs(data.key);
                data.collapsed = attrs.collapsed == 'true';
                return data;
            },
            (data) => {
                const attrs = this.istat.getAttrs(data.key);
                data.collapsed = attrs.collapsed == 'true';
                data.direction = attrs.direction || 'horizontal';
                for (const member of data.members) {
                    let edgeCandidates = this.graph.edges.filter(e => e.source == member.key);
                    for (const label of Object.keys(member.links)) {
                        if (member.key === null) {
                            continue;
                        }
                        const edgeHandle = `${member.key}.${label}`;
                        let edge = edgeCandidates.find(e => e.id.startsWith(edgeHandle));
                        if (edge === undefined) {
                            continue;
                        }
                        if (data.direction == 'horizontal') {
                            edge.sourceHandle = edgeHandle;
                            edge.targetHandle = edge.target;
                        } else {
                            edge.sourceHandle = member.key + '#B';
                            edge.targetHandle = edge.target + '#T';
                        }
                    }
                }
                return data;
            }
        )
    }
    private setTrimmed() {
        let trimmedNodes: string[] = [];
        for (const nodeData of Object.values(this.istat.boxNodeDataMap)) {
            if (this.istat.getAttrs(nodeData.key).trimmed == 'true') {
                trimmedNodes.push(nodeData.key);
            }
        }
        SubtreeIterator.traverse(this.istat, this.graph,
            (data) => {
                data.trimmed = true;
                return data;
            },
            (data) => {
                data.trimmed = true;
                return data;
            },
            trimmedNodes
        );
    }
}
