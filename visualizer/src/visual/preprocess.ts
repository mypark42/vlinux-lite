import { Snapshot, StateView, Box, Abst, Container, isShapeBox } from "@app/visual/types";

export function preprocess(snapshot: Snapshot) {
    console.log('preprocess', snapshot);
    for (const [name, view] of Object.entries(snapshot.views)) {
        // convert raw json to class object
        snapshot.views[name] = new StateView(name, view.pool, view.plot, view.init_attrs, view.stat, view.is_diff);
    }
    for (const view of Object.values(snapshot.views)) {
        try {
            ViewPreprocessor.preprocess(view);
        } catch (e) {
            console.error('preprocess error on view', view.name, e);
        }
    }
    console.log('preprocess OK', snapshot);
}

class ViewPreprocessor {
    public static preprocess(view: StateView) {
        const converter = new ViewPreprocessor(view);
        return converter.preprocess();
    }
    private view: StateView;
    constructor(view: StateView) {
        this.view = view;
    }
    private preprocess() {
        this.compactShapes();
    }
    private compactShapes() {
        for (const box of Object.values(this.view.pool.boxes)) {
            this.doCompactBoxMembers(box);
        }
        for (const container of Object.values(this.view.pool.containers)) {
            if (this.shouldCompactContainer(container)) {
                this.doCompactContainer(container);
            }
        }
    }
    private shouldCompactMember(shape: Box | Container): shape is Box {
        if (!isShapeBox(shape) || Object.keys(shape.absts).length != 1) {
            return false;
        }
        const memberMembers = Object.entries(shape.absts['default'].members);
        if (memberMembers.length != 1) {
            return false;
        }
        if (shape.label == memberMembers[0][0] || shape.key.startsWith('__virtual_')) {
            return true;
        }
        return false;
    }
    private doCompactBoxMembers(box: Box) {
        for (const abst of Object.values(box.absts)) {
            let compactedMembers: Abst['members'] = {};
            for (const [label, member] of Object.entries(abst.members)) {
                if (member.class == 'text') {
                    compactedMembers[label] = { class: 'text', type: member.type, size: member.size, value: member.value };
                } else if (member.class == 'link') {
                    compactedMembers[label] = { class: 'link', type: member.type, target: member.target };
                } else if (member.class == 'box') {
                    const memberShape = this.view.getShape(member.object);
                    if (this.shouldCompactMember(memberShape)) {
                        const setLabelAlias = (label: string) => {
                            if (label in compactedMembers) {
                                const existedMember = compactedMembers[label];
                                compactedMembers[`${label}??`] = existedMember;
                                delete compactedMembers[label];
                                return `${label}?`;
                            }
                            return label;
                        }
                        const memberMembers = Object.entries(memberShape.absts['default'].members);
                        const newLabel = setLabelAlias(memberMembers[0][0]);
                        compactedMembers[newLabel] = memberMembers[0][1];
                    } else {
                        compactedMembers[label] = { class: 'box', object: member.object };
                    }
                }
            }
            abst.members = compactedMembers;
        }
    }
    private doCompactContainer(container: Container) {
        let compactedMembers: Abst['members'] = {};
        for (const [index, member] of container.members.entries()) {
            if (member.key === null) {
                continue;
            }
            const memberShape = this.view.getShape(member.key);
            if (this.shouldCompactMember(memberShape)) {
                const setLabelAlias = (label: string) => {
                    if (label in compactedMembers) {
                        const existedMember = compactedMembers[label];
                        compactedMembers[`${label} #${index - 1}`] = existedMember;
                        delete compactedMembers[label];
                        return `${label} #${index}`;
                    }
                    return label;
                }
                const memberMembers = Object.entries(memberShape.absts['default'].members);
                const memberKey = setLabelAlias(memberMembers[0][0]);
                compactedMembers[memberKey] = memberMembers[0][1];
            } else {
                compactedMembers[member.key] = { class: 'box', object: member.key };
            }
        }
        const compacted: Box = {
            key: container.key,
            type: container.type, addr: container.addr, label: container.label, 
            parent: container.parent,
            absts: {
                default: {
                    members: compactedMembers,
                    parent: null
                }
            }
        }
        delete this.view.pool.containers[container.key];
        this.view.pool.boxes[compacted.key] = compacted;
    }
    private shouldCompactContainer(container: Container) {
        return ['[Array]', '[XArray]'].includes(container.type);
    }
}
