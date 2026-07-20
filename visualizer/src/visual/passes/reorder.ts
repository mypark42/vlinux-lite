import { ReactFlowGraph } from "@app/visual/types";
import { RendererInternalState, RendererPass } from "@app/visual/passes";

export class Reorder extends RendererPass {
    public static render(istat: RendererInternalState, graph: ReactFlowGraph): ReactFlowGraph {
        const setter = new Reorder(istat, graph);
        return setter.render();
    }
    public render(): ReactFlowGraph {
        console.log('Reorder.render()');
        this.reorder();
        return this.graph;
    }
    private reorder() {
        // Create a map to track visited nodes and detect cycles
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const sorted: typeof this.graph.nodes = [];
        
        // Create a map for quick node lookup
        const nodeMap = new Map<string, typeof this.graph.nodes[0]>();
        for (const node of this.graph.nodes) {
            nodeMap.set(node.id, node);
        }
        
        // Depth-first search to perform topological sort
        const dfs = (nodeId: string): boolean => {
            if (visiting.has(nodeId)) {
                // Cycle detected - this shouldn't happen in a proper tree structure
                console.warn(`Cycle detected involving node: ${nodeId}`);
                return false;
            }
            
            if (visited.has(nodeId)) {
                return true; // Already processed
            }
            
            const node = nodeMap.get(nodeId);
            if (!node) {
                return true; // Node not found, skip
            }
            
            visiting.add(nodeId);
            
            // First, process the parent if it exists
            if (node.parentId && !visited.has(node.parentId)) {
                if (!dfs(node.parentId)) {
                    visiting.delete(nodeId);
                    return false;
                }
            }
            
            visiting.delete(nodeId);
            visited.add(nodeId);
            sorted.push(node);
            return true;
        };
        
        // Process all nodes, starting with those that don't have parents
        const rootNodes = this.graph.nodes.filter(node => !node.parentId);
        const childNodes = this.graph.nodes.filter(node => node.parentId);
        
        // First process root nodes
        for (const node of rootNodes) {
            if (!visited.has(node.id)) {
                dfs(node.id);
            }
        }
        
        // Then process any remaining child nodes (in case of orphaned nodes)
        for (const node of childNodes) {
            if (!visited.has(node.id)) {
                dfs(node.id);
            }
        }
        
        // Update the graph with the sorted nodes
        this.graph.nodes = sorted;
        
        console.log(`Reordered ${sorted.length} nodes to ensure parent-before-child ordering`);
    }
}
