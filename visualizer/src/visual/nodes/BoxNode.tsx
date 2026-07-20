import { BoxNodeData, LinkMember, TextMember, type BoxNode } from "@app/visual/types";
import { Handle, HandleType, Position, type NodeProps } from "@xyflow/react";

import * as sc from "@app/visual/nodes/styleconf";

export default function BoxNode({ id, data }: NodeProps<BoxNode>) {
    return (
        <BoxField
            id={id} data={data} depth={0} parentCollapsed={data.parentCollapsed}
            notifier={(innerId: string, updType: string) => data.notifier?.(innerId, id, updType)}
        />
    )
}

function BoxField({
    id, data, depth, parentCollapsed,
    notifier
}: {
    id: string, data: BoxNodeData, depth: number, parentCollapsed?: boolean
    notifier: (id: string, type: string) => void
}) {
    // members
    const members = Object.entries(data.members).map(([label, member]) => {
        switch (member.class) {
            case 'box':
                const boxField = (
                    <BoxField
                        key={label} id={member.object} data={member.data} depth={depth + 1}
                        notifier={notifier} parentCollapsed={parentCollapsed || data.collapsed}
                    />
                );
                if (member.data.trimmed) {
                    return boxField;
                }
                return (
                    <div key={label} className="w-full p-1">
                        {boxField}
                    </div>
                );
            case 'text':
                return (
                    <TextField
                        key={label} label={label} member={member} depth={depth}
                        parentCollapsed={parentCollapsed || data.collapsed} isShadow={data.shadow}
                    />
                );
            case 'link':
                return (
                    <LinkField
                        key={label} label={label} member={member} depth={depth}
                        parentCollapsed={parentCollapsed || data.collapsed} isShadow={data.shadow}
                        edgeSource={`${id}.${label}`} notifier={notifier}
                    />
                );
            default:
                return null;
        }
    });
    // reactflow edge handles
    const handles = (<>
        <GenHandle id={id} type="target" position={Position.Left} />
        <GenHandle id={id + "#T"} type="target" position={Position.Top} />
        <GenHandle id={id + "#B"} type="source" position={Position.Bottom} offset={parentCollapsed || data.collapsed ? 0 : 20} />
    </>);
    // hide the component when the parent is collapsed
    if (data.trimmed) {
        return (
            <div className="absolute top-0 left-0 w-full h-0 opacity-0">
                {members}
                {handles}
            </div>
        )
    }
    if (parentCollapsed) {
        return (
            <div className="absolute top-0 left-0 w-full h-6">
                {members}
                <div className="opacity-0">{handles}</div>
            </div>
        )
    }
    // component definition
    const isDiffAdd = data.key.endsWith('$new') ? true : (data.key.endsWith('$old') ? false : undefined);
    const color = sc.TextColor(isDiffAdd);
    const txStyle = data.shadow ? 'opacity-80' : '';
    const bdStyle = data.shadow ? 'border-dotted' : '';
    const bgColor = sc.BgColor(depth, isDiffAdd);
    const bgStyle = data.shadow ? 'bg-gradient-to-bl from-gray-100/70 to-gray-300/70' : `bg-[${bgColor}]`;
    return (
        <div className={`box-node relative flex flex-col items-center rounded-md border-2 border-[${color}] ${bdStyle} ${bgStyle}`}>
            <div className="w-full ml-2 flex justify-begin items-center z-10">
                <FlipButton onClick={() => notifier(id, 'collapsed')} condition={data.collapsed ?? false} extraClassName={`mr-1 border-[${color}] ${bdStyle} text-[${color}] ${txStyle}`}/>
                <p className={`h-6 text-base text-[${color}] ${txStyle}`}>{data.label}</p>
            </div>
            {/* even if collapsed, members are required for reactflow edge rendering */}
            {data.collapsed ? (
                <div className="absolute top-0 left-0 w-full h-6 opacity-0">
                    {members}
                </div>
            ) : (
                <div className="w-full overflow-hidden">
                    <div className={`border-y border-black ${bdStyle}`}>
                        {members}
                    </div>
                    <div className="w-full flex justify-end">
                        <p className={`mr-1 text-sm text-[${color}] ${txStyle} select-text nodrag nopan`}>{data.addr}</p>
                    </div>
                </div>
            )}
            {handles}
        </div>
    );
}

function TextField({
    label, member, depth, parentCollapsed, isShadow
}: {
    label: string, member: TextMember, depth: number, parentCollapsed?: boolean, isShadow?: boolean
}) {
    if (parentCollapsed) return <></>;
    // data conversion and style config
    const value = member.value;
    const {
        labelDelta, labelLines, valueLines
    } = sc.TextFieldAdaption(label.replace('$new', '').replace('$old', ''), value, depth);
    const labelWidth = 100 - 4 * depth + 16 * Math.ceil(labelDelta / 2);
    const isDiffAdd = label.endsWith('$new') ? true : (label.endsWith('$old') ? false : undefined);
    const color = sc.TextColor(isDiffAdd);
    const isValueEmoji = (value: string) => value.startsWith('&#') && value.endsWith(';');
    const txStyle = [isShadow ? 'opacity-80' : '', isDiffAdd === false ? 'line-through' : ''].join(' ');
    // const txStyle = isShadow ? 'opacity-80' : '';
    const bdStyle = isShadow ? 'border-dotted' : '';
    // label node
    const labelNode = (
        <div style={{width: `${labelWidth}px`}} className={`px-1 flex items-center border-r-2 border-black ${bdStyle}`}>
            <TextLine lines={labelLines} textClassName={`text-[${color}] ${txStyle}`} />
        </div>
    );
    // value node
    const valueNode = (
        <div className="flex-1 flex items-center px-1 py-0.5 truncate">
            <div className="flex flex-col w-full">
                {/* handle emoji text */}
                {isValueEmoji(value) ?
                    <p className={`text-center truncate`} dangerouslySetInnerHTML={{__html: value}} />
                :
                    <TextLine lines={valueLines} textClassName={`text-center text-[${color}] ${txStyle} select-text nodrag nopan`} />
                }
            </div>
        </div>
    );
    // return
    return (
        <PrimitiveField label={labelNode} value={valueNode} isShadow={isShadow}/>
    );
}

function LinkField({
    label, member, depth, parentCollapsed, isShadow,
    edgeSource, notifier
}: {
    label: string, member: LinkMember & { isTargetTrimmed?: boolean }, depth: number, parentCollapsed?: boolean, isShadow?: boolean,
    edgeSource: string, notifier: (id: string, type: string) => void
}) {
    // edge handle
    const edgeHandle = <GenHandle id={edgeSource} type="source" position={Position.Right} />;
    if (parentCollapsed) return <>{edgeHandle}</>;
    // data conversion and style config
    const targetToValue = (target: string | null) => target ? target.split(':', 1)[0] : "null";
    const value = targetToValue(member.target);
    const isDiffAdd = label.endsWith('$new') ? true : (label.endsWith('$old') ? false : undefined);
    const color = sc.TextColor(isDiffAdd);
    const txStyle = [isShadow ? 'opacity-80' : '', isDiffAdd === false ? 'line-through' : ''].join(' ');
    const tbStyle = isShadow ? 'opacity-80' : '';
    const bdStyle = isShadow ? 'border-dotted' : '';
    const {
        labelDelta, labelLines, valueLines
    } = sc.TextFieldAdaption(label.replace('$new', '').replace('$old', ''), value, depth);
    const labelWidth = 100 - 4 * depth + 16 * Math.ceil(labelDelta / 2);
    // label node
    const labelNode = (
        <div style={{width: `${labelWidth}px`}} className={`px-1 py-0.5 flex flex-col items-center border-r-2 border-black ${bdStyle}`}>
            <TextLine lines={labelLines} textClassName={`text-[${color}] ${txStyle}`} />
        </div>
    );
    // value node
    const valueNode = (
        <div className="flex-1 flex items-center px-1 py-0.5 truncate">
            <div className="flex flex-row w-full">
                <TextLine lines={valueLines} textClassName={`text-center text-[${color}] ${txStyle}`} />
                {value != "null" && value != "(empty)" &&
                    <FlipButton onClick={() => {
                        if (member.target) {
                            notifier(member.target, 'trimmed');
                        }
                    }} condition={member.isTargetTrimmed ?? false} extraClassName={`border-[${color}] ${bdStyle} text-[${color}] ${tbStyle} select-text nodrag nopan`} />
                }
            </div>
        </div>
    );
    // return
    return (
        <PrimitiveField label={labelNode} value={valueNode} edgeHandle={edgeHandle} isShadow={isShadow}/>
    );
}

function PrimitiveField({
    label, value, edgeHandle, isShadow
}: {
    label: React.JSX.Element, value: React.JSX.Element, edgeHandle?: React.JSX.Element, isShadow?: boolean
}) {
    const bdStyle = isShadow ? 'border-dotted' : '';
    return (
        <div className={`relative w-full border-y border-black ${bdStyle}`}>
            <div className="w-full flex items-stretch leading-none">
                {label}
                {value}
            </div>
            {edgeHandle}
        </div>
    );
}

function TextLine({ lines, textClassName }: {lines: string[], textClassName?: string}) {
    return (
        <div className="flex flex-col w-full">
            {lines.map((line, i) => (
                <p key={i} className={`select-text ${textClassName}`}>{line}</p>
            ))}
        </div>
    );
}

function FlipButton({ onClick, condition, extraClassName = "" }: { onClick: () => void, condition: boolean, extraClassName?: string }) {
    return (
        <button 
            className={`w-4 h-4 text-sm flex items-center justify-center rounded border ${extraClassName}`}
            onClick={onClick}
        >
            {condition ? '+' : '-'}
        </button>
    )
}

function GenHandle({ id, type, position, offset = 0 }: { id: string, type: HandleType, position: Position, offset?: number }) {
    const stylePosition = {
        [Position.Left]:   { left: `${offset}px` },
        [Position.Right]:  { right: `${offset}px` },
        [Position.Top]:    { top: `${offset}px` },
        [Position.Bottom]: { bottom: `${offset}px` },
    }[position];
    return (
        <Handle 
            id={id} type={type} position={position} 
            style={{ width: '5px', height: '5px', ...stylePosition }}
        />
    )
}
