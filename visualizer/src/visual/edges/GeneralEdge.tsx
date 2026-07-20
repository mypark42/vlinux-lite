import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

function ArrowMarker({ id, size, color }: { id: string, size: string, color: string }) {
    return (
        <marker
            id={id} viewBox="0 0 20 20"
            refX="15" refY="10"
            markerWidth={size} markerHeight={size}
            orient="auto"
        >
            <path d="M 0 0 L 20 10 L 0 20 z" fill={color} />
        </marker>
    );
}
 
export default function CustomEdge({
    id,
    sourceX, sourceY,
    targetX, targetY,
    sourcePosition,
    targetPosition,
    style = {}, markerEnd, selected,
    ...props
}: EdgeProps) {
    const [edgePath] = getBezierPath({
        sourceX, sourceY,
        targetX, targetY,
        sourcePosition, targetPosition,
        curvature: 0.25
    });

    const colorNormal = style.stroke || '#000000';
    const colorSelected = 'rgb(245, 125, 189)';

    const safeId = id.replace(/[^a-zA-Z0-9]/g, '_');
    const markerNormalId = `arrow_${safeId}_normal`;
    const markerSelectedId = `arrow_${safeId}_selected`;

    return (
        <>
            <defs>
                <ArrowMarker id={markerNormalId} size="8" color={colorNormal} />
                <ArrowMarker id={markerSelectedId} size="6" color={colorSelected} />
            </defs>
            <BaseEdge
                path={edgePath}
                {...props}
                style={{
                    stroke: selected ? colorSelected : colorNormal,
                    strokeWidth: selected ? 2.5 : 1.5,
                    zIndex: 10
                }}
                markerEnd={selected ? `url(#${markerSelectedId})` : `url(#${markerNormalId})`}
            />
        </>
    );
}
