import { useContext, useEffect, useState } from "react";
import { Rnd } from "react-rnd";
import { GlobalStateContext } from "@app/context/Context";
import { eventBus } from "@app/context/EventBus";
import { SecondaryPanel } from "@app/context/Panels";
import { ButtonDef, ButtonsWrapper, ButtonWrapper } from "@app/panes/buttons";
import * as icons from "@app/panes/libs/Icons";
import { ReactFlowGraph } from "@app/visual/types";
import { nodeTypes } from "@app/visual/nodes";
import { edgeTypes } from "@app/visual/edges";

import {
    ReactFlowProvider,
    ReactFlow,
    Background,
    type Node, type Edge,
    useNodesState, useEdgesState,
    useReactFlow,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

export default function SecondaryPane({ node }: { node: SecondaryPanel }) {
    const [rndPosition, setRndPosition] = useState({
        x: 150, y: 205
    });
    const [rndSize, setRndSize] = useState({
        width: 360, height: 256
    });
    const { state, stateDispatch } = useContext(GlobalStateContext);
    //
    let buttons: ButtonDef[] = [{
        icon: <icons.AkarIconsAugmentedReality color="#5755d9"/>,
        desc: "focus",
        ifEnabled: true,
        onClick: () => {
            eventBus.emit('FOCUS', { objectKey: node.objectKey });
        }
    }, {
        icon: <icons.AkarIconsTrashCan color="#5755d9"/>,
        desc: "remove",
        ifEnabled: true,
        onClick: () => stateDispatch({ command: 'REMOVE', pKey: node.key })
    }];
    return (
        <Rnd position={rndPosition} size={rndSize} minWidth={320} minHeight={256} bounds=".main-pane"
            dragHandleClassName="react-draggable-cursor"
            className="bg-amber-50"
            onDragStop={(_event, data) => {
                setRndPosition({ x: data.x, y: data.y });
            }}
            onResizeStop={(_event, _dir, ref, _delta, position) => {
                setRndPosition(position);
                setRndSize({
                    width: parseInt(ref.style.width),
                    height: parseInt(ref.style.height),
                });
            }}
        >
            <ReactFlowProvider>
            <div className="h-full flex flex-col border-2 border-[#5755d9]">
                <div className="react-draggable-cursor container h-auto flex flex-row flex-wrap justify-between border-b-2 border-[#5755d9] px-0">
                    <ButtonsWrapper direction="left">
                        <button className="h-[30px] px-2 flex items-center justify-center border-2 border-gray-800 rounded cursor-move">
                            {node.objectKey}
                        </button>
                        <></>
                    </ButtonsWrapper>
                    <ButtonsWrapper direction="right">
                        {...buttons.map((btn, i) => 
                            <ButtonWrapper buttonDef={btn} key={i}/>
                        )}
                    </ButtonsWrapper>
                </div>
                <div className="flex h-full">
                    <ReactFlowDiagram graph={{ nodes: [], edges: [] }} />
                </div>
            </div>
            </ReactFlowProvider>
        </Rnd>
    );
}

function ReactFlowDiagram({ graph }: { graph: ReactFlowGraph }) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const { fitView, setCenter } = useReactFlow();

    useEffect(() => {
        const handleFocus = ({ objectKey }: { objectKey: string }) => {
            const dollarIndex = objectKey.indexOf('$');
            if (dollarIndex !== -1) {
                objectKey = objectKey.substring(0, dollarIndex);
            }
            const node = nodes.find(n => n.id == objectKey);
            if (node) {
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
    }, [nodes, setCenter]);
    
    // Update nodes and edges when graph changes
    useEffect(() => {
        const notifier = (_id: string, _rootId: string, _type: string) => {};
        graph.nodes = graph.nodes.map(node => {
            if (node.type == 'box' || node.type == 'container') {
                node.data.notifier = notifier;
            }
            return node;
        });
        setNodes(graph.nodes);
        setEdges(graph.edges);
        setTimeout(() => {
            window.requestAnimationFrame(() => {
                fitView();
            });
        }, 100);
    }, [graph]);
    return (
        <ReactFlow
            nodes={nodes} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
            edges={edges} edgeTypes={edgeTypes} onEdgesChange={onEdgesChange}
            nodesConnectable={false} deleteKeyCode={null}
            fitView
        >
            <Background />
        </ReactFlow>
    );
}
