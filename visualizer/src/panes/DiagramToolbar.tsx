import { useContext, useMemo, useState } from "react";
import { GlobalStateContext } from "@app/context/Context";
import { eventBus } from "@app/context/EventBus";
import { SplitDirection } from "@app/context/Panels";
import { ButtonDef, ButtonsWrapper, ButtonWrapper } from "@app/panes/buttons";
import * as icons from "@app/panes/libs/Icons";
import { Snapshot } from "@app/visual/types";
import { useReactFlow, getViewportForBounds, ReactFlowInstance } from "@xyflow/react";
// import { toPng, toSvg } from "html-to-image";
import { toPng } from "html-to-image";

export default function DiagramToolbar({ pKey, selected }: { pKey: number, selected: string | undefined }) {
    const rfInstance = useReactFlow();
    const { state, stateDispatch } = useContext(GlobalStateContext);
    let viewname = useMemo(() => state.panels.getViewname(pKey), [state, pKey]);
    //
    let buttons: ButtonDef[] = useMemo(() => [{
        icon: <icons.AkarIconsAugmentedReality color="#5755d9"/>,
        desc: "focus",
        ifEnabled: selected !== undefined,
        onClick: () => {
            if (viewname !== undefined && selected !== undefined) {
                eventBus.emit('FOCUS', { objectKey: selected });
            }
        }
    }, {
        icon: <icons.AkarIconsArrowForwardThick color="#5755d9"/>,
        desc: "pick",
        ifEnabled: selected !== undefined,
        onClick: () => {
            if (viewname !== undefined && selected !== undefined) {
                // use pKey instead of viewname here to maintain protocol consistency,
                // since it is hard for user (and LLM) to specify viewname in the gdb side.
                stateDispatch({ command: 'PICK', pKey, objectKey: selected });
            }
        }
    }, {
        icon: <icons.AkarIconsChevronVertical color="#5755d9"/>,
        desc: "split (vert)",
        ifEnabled: true,
        onClick: () => stateDispatch({ command: 'SPLIT', pKey, direction: SplitDirection.horizontal })
    }, {
        icon: <icons.AkarIconsChevronHorizontal color="#5755d9"/>,
        desc: "split (horiz)",
        ifEnabled: true,
        onClick: () => stateDispatch({ command: 'SPLIT', pKey, direction: SplitDirection.vertical })
    }, {
        icon: <icons.AkarIconsDownload color="#5755d9"/>,
        desc: "download",
        ifEnabled: viewname !== undefined,
        onClick: () => downloadImage(rfInstance)
    }, {
        icon: <icons.AkarIconsTrashCan color="#5755d9"/>,
        desc: "remove",
        ifEnabled: state.panels.isRemovable(pKey),
        onClick: () => {
            console.log('click remove', pKey);
            stateDispatch({ command: 'REMOVE', pKey });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }], [state, selected]);

    return (
        <div className="h-auto flex flex-row flex-wrap justify-between border-b-2 border-[#5755d9]">
            <ButtonsWrapper direction="left">
                <div className="w-[30px] h-[30px] flex items-center justify-center border-2 border-[#5755d9] rounded cursor-pointer">
                    #{pKey}
                </div>
                <ViewSelector pKey={pKey} />
                <SnapshotSelector pKey={pKey} />
            </ButtonsWrapper>
            <ButtonsWrapper direction="right">
                {/* <DropdownAbstSelector wKey={wKey} enabled={selected !== undefined}/> */}
                {...buttons.map((btn, i) => 
                    <ButtonWrapper buttonDef={btn} key={i}/>
                )}
            </ButtonsWrapper>
        </div>
    );
}

function downloadImage(rfInstance: ReactFlowInstance) {
    // we calculate a transform for the nodes so that all nodes are visible
    // we then overwrite the transform of the `.react-flow__viewport` element
    // with the style option of the html-to-image library
    const { getNodes, getNodesBounds } = rfInstance;
    const nodesBounds = getNodesBounds(getNodes());
    nodesBounds.width += nodesBounds.x * 2;
    nodesBounds.height += nodesBounds.y * 2;
    nodesBounds.x = 0;
    nodesBounds.y = 0;
    const viewport = getViewportForBounds(
        nodesBounds,
        nodesBounds.width, nodesBounds.height,
        1, 1,
        2,
    );
    // @ts-ignore
    toPng(document.querySelector('.react-flow__viewport'), {
        backgroundColor: '#ffffff',
        width: nodesBounds.width,
        height: nodesBounds.height,
        style: {
            width: nodesBounds.width,
            height: nodesBounds.height,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
    }).then((data) => downloadImageByHtml(data, 'png'));
    // }).then(data => downloadImageByHtml(data, 'svg'));
}
function downloadImageByHtml(dataUrl: string, fmt: string) {
    const a = document.createElement('a');
    a.setAttribute('download', `reactflow.${fmt}`);
    a.setAttribute('href', dataUrl);
    a.click();
    a.remove();
}

function ViewSelector({ pKey }: { pKey: number }) {
    const { state, stateDispatch } = useContext(GlobalStateContext);
    const [isOpen, setIsOpen] = useState(false);
    const displayed = state.panels.getDisplayed(pKey);
    const viewnameList = useMemo(() => {
        return state.snapshots.getViewnameList(displayed.snKey);
    }, [displayed, state]);

    const toggleDropdown = () => setIsOpen(!isOpen);
    const closeDropdown = () => setIsOpen(false);

    const handleSelect = (viewname: string) => {
        stateDispatch({ command: 'SWITCH', pKey, viewname });
        closeDropdown();
    };

    return (
        <div className="relative">
            <button 
                className="h-[30px] px-2 flex items-center justify-center border-2 border-[#5755d9] rounded cursor-pointer"
                onClick={toggleDropdown}
            >
                {displayed.viewname ? displayed.viewname.slice(displayed.viewname.lastIndexOf('.') + 1) : 'select a plot...'}
            </button>
            
            {isOpen && (
                <div className="absolute z-10 mt-0.5 left-0">
                    <ul className="min-w-48 bg-white border-2 border-[#5755d9] rounded shadow-lg">
                        {viewnameList.map((viewname, index, array) => (
                            <li 
                                className={`px-2 py-0.5 cursor-pointer ${index < array.length - 1 ? 'border-b-2 border-[#5755d9]' : ''}`}
                                key={index} 
                                onClick={() => handleSelect(viewname)}
                            >
                                <a className="block text-gray-800">{viewname}</a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function SnapshotSelector({ pKey }: { pKey: number }) {
    const { state, stateDispatch } = useContext(GlobalStateContext);
    const [isOpen, setIsOpen] = useState(false);
    const displayed = state.panels.getDisplayed(pKey);
    const snapshotList = state.snapshots.data;

    const toggleDropdown = () => setIsOpen(!isOpen);
    const closeDropdown = () => setIsOpen(false);

    const handleSelect = (snKey: string) => {
        stateDispatch({ command: 'USE', pKey, snKey });
        closeDropdown();
    };

    return (
        <div className="relative">
            <button 
                className="h-[30px] px-2 flex items-center justify-center border-2 border-[#5755d9] rounded cursor-pointer"
                onClick={toggleDropdown}
            >
                {displayed.snKey ? displayed.snKey.slice(displayed.snKey.lastIndexOf('.') + 1) : 'select a snapshot...'}
            </button>
            
            {isOpen && (
                <div className="absolute z-10 mt-0.5 left-0">
                    <ul className="min-w-48 bg-white border-2 border-[#5755d9] rounded shadow-lg">
                        {snapshotList.map((snapshot) => {
                            return (
                                <li 
                                    key={snapshot.key} 
                                    className="px-2 whitespace-pre-wrap overflow-x-hidden text-ellipsis cursor-pointer hover:bg-gray-200"
                                    onClick={() => handleSelect(snapshot.key)}
                                >
                                    <a className="block text-gray-800">{snapshotTitle(snapshot)}</a>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

function snapshotTitle(snapshot: Snapshot) {
    if (snapshot.timestamp != 0) {
        return snapshot.key + '\n' + timestampToDate(snapshot.timestamp);
    }
    return snapshot.key + '\n' + '---';
}

function timestampToDate(timestamp: number) {
    return new Date(timestamp * 1000).toLocaleString(undefined, {
        // month: 'numeric',
        // day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });
}
