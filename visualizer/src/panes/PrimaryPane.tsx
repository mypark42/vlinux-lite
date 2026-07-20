import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { GlobalStateContext } from "@app/context/Context";
import { eventBus } from "@app/context/EventBus";
import DiagramToolbar from "@app/panes/DiagramToolbar";
import * as icons from "@app/panes/libs/Icons";
import { Renderer } from "@app/visual/render";
import { nodeTypes } from "@app/visual/nodes";
import { edgeTypes } from "@app/visual/edges";

import {
    ReactFlowProvider,
    ReactFlow,
    Background, Controls, MiniMap, Panel,
    type Node, type Edge,
    useNodesState, useEdgesState,
    useReactFlow,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "../index.css";

export default function PrimaryPane({ pKey }: { pKey: number }) {
    const [selected, setSelected] = useState<string | undefined>(undefined);
    return (
        <ReactFlowProvider>
            <div className="h-full flex flex-col border-2 border-[#5755d9]">
                <DiagramToolbar pKey={pKey} selected={selected} />
                <div className="flex h-full bg-white">
                    <ReactFlowDiagram pKey={pKey} setSelected={setSelected} />
                </div>
            </div>
        </ReactFlowProvider>
    );
}

function ReactFlowDiagram({ pKey, setSelected }: { pKey: number, setSelected: (selected: string | undefined) => void }) {
    const { state } = useContext(GlobalStateContext);

    // use deep comparison to avoid unnecessary re-rendering
    const rawDisplayed = state.panels.getDisplayed(pKey);
    const displayed = useMemo(() => rawDisplayed, [
        rawDisplayed.snKey,
        rawDisplayed.viewname,
        JSON.stringify(rawDisplayed.viewAttrs)
    ]);

    const [renderer] = useState<Renderer>(() => {
        const { view, attrs } = state.getPlot(displayed);
        return new Renderer(view, attrs);
    });
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [shouldUpdate, setShouldUpdate] = useState<[string, string, string] | undefined>(undefined);
    const [showMiniMap, setShowMiniMap] = useState(true);
    const { fitView, setCenter } = useReactFlow();
    
    const refreshNodeSelection = useCallback((nodeId: string | undefined) => {
        setSelected(nodeId);
        setNodes((nds) =>
            nds.map((nd) => {
                const newSelected = nd.id == nodeId;
                if (nd.selected != newSelected) {
                    return { ...nd, selected: newSelected };
                }
                return nd;
            })
        );
    }, [setSelected, setNodes]);

    useEffect(() => {
        const handleFocus = ({ objectKey }: { objectKey: string }) => {
            const dollarIndex = objectKey.indexOf('$');
            if (dollarIndex !== -1) {
                objectKey = objectKey.substring(0, dollarIndex);
            }
            const node = nodes.find(n => n.id == objectKey);
            if (node) {
                refreshNodeSelection(objectKey);
                let x = node.position.x + (node.width || 0) / 2;
                let y = node.position.y + (node.height || 0) / 2;
                let currentNode = node;
                while (currentNode.parentId) {
                    const parentNode = nodes.find(n => n.id == currentNode.parentId);
                    if (parentNode) {
                        x += parentNode.position.x;
                        y += parentNode.position.y;
                        currentNode = parentNode;
                    } else {
                        break;
                    }
                }
                setCenter(x, y, { zoom: 0.75, duration: 300 });
            }
        };
        eventBus.on('FOCUS', handleFocus);
        return () => eventBus.off('FOCUS', handleFocus);
    }, [nodes, refreshNodeSelection, setCenter]);
    
    // Update nodes and edges when graph changes
    useEffect(() => {
        const { view, attrs } = state.getPlot(displayed);
        renderer.reset(view, attrs);
        // clear-then-reset to avoid react-flow render error (root cause of which is unknown)
        setNodes([]);
        setEdges([]);
        if (view !== null) {
            setTimeout(() => {
                let graph = renderer.create();
                const notifier = (id: string, rootId: string, type: string) => setShouldUpdate([id, rootId, type]);
                graph.nodes = graph.nodes.map(node => {
                    if (node.type == 'box' || node.type == 'container') {
                        node.data.notifier = notifier;
                    }
                    return node;
                });
                let { nodes, edges } = renderer.finalize();
                setNodes(nodes);
                setEdges(edges);
                setTimeout(() => {
                    window.requestAnimationFrame(() => {
                        fitView();
                    });
                }, 100);
            }, 100);
        }
    }, [displayed]);
    useEffect(() => {
        if (shouldUpdate) {
            renderer.refresh(...shouldUpdate);
            let { nodes, edges } = renderer.finalize();
            setNodes(nodes);
            setEdges(edges);
            setShouldUpdate(undefined);
        }
    }, [shouldUpdate]);
    return (
        <ReactFlow
            nodes={nodes} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
            edges={edges} edgeTypes={edgeTypes} onEdgesChange={onEdgesChange}
            nodesConnectable={false} deleteKeyCode={null}
            onNodeClick={(_, node) => refreshNodeSelection(node.id)}
            onNodeDragStart={(_, node) => refreshNodeSelection(node.id)}
            onEdgeClick={() => refreshNodeSelection(undefined)}
            onPaneClick={() => refreshNodeSelection(undefined)}
            fitView
        >
            <Background />
            {showMiniMap && <MiniMap pannable={true} style={{ width: 160, height: 128 }} />}
            <Controls />
            <Panel position="bottom-right" className="flex flex-col gap-2 items-end mb-16">
                <button 
                    onClick={() => setShowMiniMap(!showMiniMap)}
                    className="bg-white hover:bg-gray-100 border border-gray-300 rounded p-0.5 shadow-sm cursor-pointer transition-colors"
                    title={showMiniMap ? 'Hide MiniMap' : 'Show MiniMap'}
                >
                    <icons.AkarIconsMap color={showMiniMap ? '#374151' : '#9ca3af'} width={14} height={14} />
                </button>
            </Panel>
        </ReactFlow>
    );
}
