import { Snapshot, StateView, Box, Abst, Container, ContainerMember } from "./types";

export function calcSnapshotDiff(diffKey: string, snSrc: Snapshot, snDst: Snapshot, trackedAddrs: number[]): Snapshot {
    return new SnapshotDiffSynthesizer(diffKey, snSrc, snDst, trackedAddrs).synthesize();
}

class SnapshotDiffSynthesizer {
    key: string;
    snSrc: Snapshot;
    snDst: Snapshot;
    snRes: Snapshot;
    trackedAddrs: number[];
    constructor(key: string, snSrc: Snapshot, snDst: Snapshot, trackedAddrs: number[]) {
        this.key = key;
        this.snSrc = JSON.parse(JSON.stringify(snSrc));
        this.snDst = JSON.parse(JSON.stringify(snDst));
        this.snRes = { key: key, views: {}, pc: '', timestamp: 0 };
        this.trackedAddrs = trackedAddrs;
    }
    synthesize() {
        console.log('synthesize diff', this.snSrc, this.snDst);
        // synthesize diff for each view
        for (const [viewname, viewDst] of Object.entries(this.snDst.views)) {
            if (viewname in this.snSrc.views) {
                const viewSrc = this.snSrc.views[viewname];
                this.snRes.views[viewname] = this.calcStateViewDiff(viewname, viewSrc, viewDst);
            }
        }
        console.log('synthesize diff OK', this.snRes);
        return this.snRes;
    }
    private calcStateViewDiff(viewname: string, viewSrc: StateView, viewDst: StateView): StateView {
        // init empty
        const viewDiff = new StateView(viewname, { boxes: {}, containers: {} }, viewDst.plot, {}, 0, true);
        // rewrite not co-exist objects with $old/$new suffix
        this.rewriteObjectKeyForViewDiff(viewSrc, viewDst);
        // boxes
        for (const [key, boxDst] of Object.entries(viewDst.pool.boxes)) {
            if (key in viewSrc.pool.boxes) {
                const boxSrc = viewSrc.pool.boxes[key];
                viewDiff.pool.boxes[key] = this.calcBoxDiff(boxSrc, boxDst);
            } else {
                viewDiff.pool.boxes[key] = { ...boxDst };
            }
        }
        for (const [key, boxSrc] of Object.entries(viewSrc.pool.boxes)) {
            if (!(key in viewDst.pool.boxes)) {
                viewDiff.pool.boxes[key] = { ...boxSrc };
            }
        }
        // containers
        for (const [key, containerDst] of Object.entries(viewDst.pool.containers)) {
            if (key in viewSrc.pool.containers) {
                const containerSrc = viewSrc.pool.containers[key];
                viewDiff.pool.containers[key] = this.calcContainerDiff(containerSrc, containerDst);
            } else {
                viewDiff.pool.containers[key] = { ...containerDst };
            }
        }
        for (const [key, containerSrc] of Object.entries(viewSrc.pool.containers)) {
            if (!(key in viewDst.pool.containers)) {
                viewDiff.pool.containers[key] = { ...containerSrc };
            }
        }
        // attrs
        for (const [key, attrsDst] of Object.entries(viewDst.init_attrs)) {
            if (key in viewSrc.init_attrs) {
                const attrsSrc = viewSrc.init_attrs[key];
                const bothTrimmed   = (attrsSrc.trimmed   == "true" && attrsDst.trimmed   == "true");
                const bothCollapsed = (attrsSrc.collapsed == "true" && attrsDst.collapsed == "true");
                viewDiff.init_attrs[key] = {
                    ...attrsSrc,
                    ...attrsDst,
                    trimmed:   (bothTrimmed   ? "true" : "false"),
                    collapsed: (bothCollapsed ? "true" : "false"),
                }
            } else if (key in viewSrc.pool.boxes || key in viewSrc.pool.containers) {
                viewDiff.init_attrs[key] = {
                    ...attrsDst,
                    trimmed:   "false",
                    collapsed: "false",
                };
            } else {
                viewDiff.init_attrs[key] = { ...attrsDst };
            }
        }
        for (const [key, attrsSrc] of Object.entries(viewSrc.init_attrs)) {
            if (key in viewDst.init_attrs) {
                continue;
            }
            if (key in viewDst.pool.boxes || key in viewDst.pool.containers) {
                viewDiff.init_attrs[key] = {
                    ...attrsSrc,
                    trimmed:   "false",
                    collapsed: "false",
                };
            } else {
                viewDiff.init_attrs[key] = { ...attrsSrc};
            }
        }
        // return
        console.log('diffres:', viewDiff);
        return viewDiff;
    }
    private rewriteObjectKeyForViewDiff(viewSrc: StateView, viewDst: StateView) {
        // rewrite for viewDst
        let rewriteDst: Set<string> = new Set();
        for (const key of Object.keys(viewDst.pool.boxes)) {
            if (!(key in viewSrc.pool.boxes) || key in this.trackedAddrs) {
                rewriteDst.add(key);
            }
        }
        for (const key of Object.keys(viewDst.pool.containers)) {
            if (!(key in viewSrc.pool.containers) || key in this.trackedAddrs) {
                rewriteDst.add(key);
            }
        }
        this.rewriteObjectKeyWithSuffix(viewDst, rewriteDst, '$new');
        // rewrite for viewSrc
        let rewriteSrc: Set<string> = new Set();
        for (const key of Object.keys(viewSrc.pool.boxes)) {
            if (!(key in viewDst.pool.boxes) || key in this.trackedAddrs) {
                rewriteSrc.add(key);
            }
        }
        for (const key of Object.keys(viewSrc.pool.containers)) {
            if (!(key in viewDst.pool.containers) || key in this.trackedAddrs) {
                rewriteSrc.add(key);
            }
        }
        this.rewriteObjectKeyWithSuffix(viewSrc, rewriteSrc, '$old');
    }
    private rewriteObjectKeyWithSuffix(view: StateView, rewriteSet: Set<string>, suffix: string) {
        for (const key of rewriteSet) {
            if (key in view.pool.boxes) {
                let box = view.pool.boxes[key];
                box.key = key + suffix;
                view.pool.boxes[key + suffix] = box;
                delete view.pool.boxes[key];
            }
            if (key in view.pool.containers) {
                let container = view.pool.containers[key];
                container.key = key + suffix;
                view.pool.containers[key + suffix] = container;
                delete view.pool.containers[key];
            }
            if (key in view.init_attrs) {
                view.init_attrs[key + suffix] = view.init_attrs[key];
                delete view.init_attrs[key];
            }
        }
        for (const box of Object.values(view.pool.boxes)) {
            for (const abst of Object.values(box.absts)) {
                for (const member of Object.values(abst.members)) {
                    if (member.class == 'link' && member.target != null && rewriteSet.has(member.target)) {
                        member.target = member.target + suffix;
                    } else if (member.class == 'box' && rewriteSet.has(member.object)) {
                        member.object = member.object + suffix;
                    }
                }
            }
            if (box.parent != null && rewriteSet.has(box.parent)) {
                box.parent = box.parent + suffix;
            }
        }
        for (const container of Object.values(view.pool.containers)) {
            for (const member of container.members) {
                if (member.key != null && rewriteSet.has(member.key)) {
                    member.key = member.key + suffix;
                }
                for (const link of Object.values(member.links)) {
                    if (link.target != null && rewriteSet.has(link.target)) {
                        link.target = link.target + suffix;
                    }
                }
            }
            if (container.parent != null && rewriteSet.has(container.parent)) {
                container.parent = container.parent + suffix;
            }
        }
        for (const index in view.plot) {
            if (rewriteSet.has(view.plot[index])) {
                view.plot[index] = view.plot[index] + suffix;
            }
        }
    }
    private calcBoxDiff(boxSrc: Box, boxDst: Box): Box {
        const boxDiff: Box = {
            key: boxDst.key, addr: boxDst.addr,
            type: boxDst.type, label: boxDst.label,
            absts: {},
            parent: boxDst.parent,
        };
        // views one by one
        for (const [viewname, viewDst] of Object.entries(boxDst.absts)) {
            if (viewname in boxSrc.absts) {
                const viewSrc = boxSrc.absts[viewname];
                const membersSrc = this.handleViewInheritance(boxSrc, viewSrc);
                const membersDst = this.handleViewInheritance(boxDst, viewDst);
                const membersDiff = this.calcViewDiff(membersSrc, membersDst);
                boxDiff.absts[viewname] = { parent: null, members: membersDiff };
            } else {
                throw new Error(`view ${viewname} not found in viewSrc`);
            }
        }
        return boxDiff;
    }
    private handleViewInheritance(box: Box, abst: Abst): Abst['members'] {
        if (abst.parent === null) {
            return { ...abst.members };
        }
        const parentMembers = this.handleViewInheritance(box, box.absts[abst.parent]);
        return { ...parentMembers, ...abst.members };
    }
    private calcViewDiff(membersSrc: Abst['members'], membersDst: Abst['members']): Abst['members'] {
        const membersDiff: Abst['members'] = {};
        for (const [label, memberDst] of Object.entries(membersDst)) {
            if (label in membersSrc) {
                const memberSrc = membersSrc[label];
                if (memberSrc.class != memberDst.class ||
                    (memberSrc.class == 'text' && memberDst.class == 'text' && memberSrc.value  != memberDst.value)  ||
                    (memberSrc.class == 'link' && memberDst.class == 'link' && memberSrc.target != memberDst.target) ||
                    (memberSrc.class == 'box'  && memberDst.class == 'box'  && memberSrc.object != memberDst.object)
                ) {
                    membersDiff[label + '$old'] = { ...memberSrc };
                    membersDiff[label + '$new'] = { ...memberDst };
                } else {
                    membersDiff[label] = { ...memberDst };
                }
            } else {
                membersDiff[label + '$new'] = { ...memberDst };
            }
        }
        for (const [label, memberSrc] of Object.entries(membersSrc)) {
            if (!(label in membersDst)) {
                membersDiff[label + '$old'] = { ...memberSrc };
            }
        }
        return membersDiff;
    }
    private calcContainerDiff(containerSrc: Container, containerDst: Container): Container {
        const containerDiff: Container = {
            key: containerDst.key, addr: containerDst.addr,
            type: containerDst.type, label: containerDst.label,
            members: [],
            parent: containerDst.parent,
        };
        for (const memberDst of containerDst.members) {
            const memberSrc = containerSrc.members.find(m => m.key === memberDst.key);
            if (memberSrc) {
                const memberDiff: ContainerMember = {
                    key: memberDst.key,
                    links: {},
                };
                for (const [label, linkDst] of Object.entries(memberDst.links)) {
                    if (label in memberSrc.links) {
                        const linkSrc = memberSrc.links[label];
                        if (linkSrc.target != linkDst.target) {
                            memberDiff.links[label + '$old'] = { ...linkSrc };
                            memberDiff.links[label + '$new'] = { ...linkDst };
                        } else {
                            memberDiff.links[label] = { ...linkDst };
                        }
                    } else {
                        console.warn(`container member ${memberDst.key} has link ${label} not found in source`);
                    }
                }
                containerDiff.members.push(memberDiff);
            } else {
                containerDiff.members.push({ ...memberDst });
            }
        }
        for (const memberSrc of containerSrc.members) {
            const memberDst = containerDst.members.find(m => m.key === memberSrc.key);
            if (!memberDst) {
                containerDiff.members.push({ ...memberSrc });
            }
        }
        return containerDiff;
    }
}
