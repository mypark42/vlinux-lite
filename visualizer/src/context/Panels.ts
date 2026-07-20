import { ViewAttrs } from "@app/visual/types";
import { ISplitProps } from "split-pane-react/esm/types";

export default class Panels {
    /**
     * The paneling model is a tree of PrimaryArea. Its root node is always a PrimaryArea.
     * Each PrimaryArea has a list of PrimaryPanel.
     * Each PrimaryPanel has a list of connected SecondaryPanel.
     */
    root: PrimaryArea
    secondaries: (SecondaryPanel | undefined)[]
    constructor(root?: PrimaryArea, secondaries?: (SecondaryPanel | undefined)[]) {
        if (root === undefined) {
            root = new PrimaryArea(null, []);
            root.children.push(new PrimaryPanel(root));
        }
        this.root = root;
        this.secondaries = secondaries || [];
    }
    toString() {
        return this.root.toString() + ', ' + this.secondaries.toString();
    }
    //
    // panel actions
    //
    split(pKey: number, direction: SplitDirection) {
        // direction (l/r/u/d) => splitDirection (v/h), splitForward (T:lu/F:rd)
        // let splitDirection = Math.floor(direction / 2);
        // let splitDirection = (direction == Direction.left || direction == Direction.right ?
        //     SplitDirection.vertical : SplitDirection.horizontal);
        // let splitIsForward = (direction % 2 == 0);
        let node = this.find(pKey);
        if (node === undefined) {
            throw new Error(`panels.split(): failed to find panel #${pKey}.`);
        }
        node.split(direction);
    }
    pick(pKey: number, objectKey: string) {
        let viewname = this.getViewname(pKey);
        if (viewname === undefined) {
            throw new Error(`panels.pick(): viewname is not set on panel #${pKey}.`);
        }
        let panel = new SecondaryPanel(viewname, objectKey);
        let index = this.secondaries.findIndex(node => !node);
        if (index == -1) {
            this.secondaries.push(panel);
        } else {
            this.secondaries[index] = panel;
        }
    }
    use(pKey: number, snKey: string) {
        let node = this.findAndCheck(pKey);
        node.changeSnapshot(snKey);
    }
    switch(pKey: number, viewname: string | undefined) {
        let node = this.findAndCheck(pKey);
        node.changeViewname(viewname);
    }
    update(pKey: number, attrs: ViewAttrs) {
        let node = this.findAndCheck(pKey);
        node.updateCurrentViewAttrs(attrs);
    }
    reset(pKey: number) {
        let node = this.findAndCheck(pKey);
        node.resetCurrentViewAttrs({});
    }
    select(pKey: number, objectKey: string | undefined) {
        let node = this.findAndCheck(pKey);
        node.changeSelectedObject(objectKey);
    }
    remove(pKey: number) {
        let node = this.find(pKey);
        if (node === undefined) {
            this.secondaries = this.secondaries.map(node => node && node.key == pKey ? undefined : node);
            return;
        }
        if (!this.isNodeRemovable(node)) {
            throw new Error(`panels.remove(): panel #${pKey} is not removable.`);
        }
        let parent = node.parent;
        parent.removeChild(pKey);
        if (parent.children.length == 0) {
            throw new Error(`panels.remove(): empty children.`);
        }
        let p: PrimaryArea | PrimaryPanel = parent;
        while (p.parent !== null) {
            if (p.children.length == 1) {
                p.parent.replaceChild(p, p.children[0]);
            }
            p = p.parent;
        }
    }
    //
    // other APIs
    //
    getDisplayed(pKey: number): DisplayOption {
        return this.findAndCheck(pKey).displayed;
    }
    getViewname(pKey: number): string | undefined {
        return this.findAndCheck(pKey).getCurrentViewname();
    }
    getViewAttrs(pKey: number): ViewAttrs {
        let node = this.find(pKey);
        if (node && node.getCurrentViewname()) {
            return node.getCurrentViewAttrs();
        }
        return {};
    }
    getSelectedObject(pKey: number, isPrimary: boolean = true): string | undefined {
        if (isPrimary) {
            return this.findAndCheck(pKey).getSelectedObject();
        } else {
            return this.secondaries.find(node => node && node.key == pKey)?.objectKey;
        }
    }
    isRemovable(pKey: number) {
        let node = this.findAndCheck(pKey);
        return this.isNodeRemovable(node);
    }
    //
    // private utils
    //
    private find(pKey: number) {
        // find the primary panel with the given key
        // Since there are at most a few dozen windows, a brute-force DFS is sufficient.
        return this.root.find(pKey);
    }
    private findAndCheck(pKey: number) {
        let node = this.find(pKey);
        if (node === undefined) {
            throw new Error(`panels.findAndCheck(): failed to find panel with key=${pKey}.`);
        }
        return node;
    }
    private isNodeRemovable(node: PrimaryPanel) {
        let parent = node.parent;
        if (parent.parent === null && parent.children.length == 1) {
            // removing the last node is not allowed
            return false;
        }
        return true;
    }
}

export class PrimaryArea {
    public direction: SplitDirection
    public parent: PrimaryArea | null
    public children: (PrimaryArea | PrimaryPanel)[]
    constructor(parent: PrimaryArea | null, children: PrimaryPanel[], direction: SplitDirection = SplitDirection.undefined) {
        this.direction = direction;
        this.parent    = parent;
        this.children  = children;
        for (let child of this.children) {
            child.parent = this;
        }
    }
    public get key(): string {
        return '#(' + this.children.map(child => child.key).join('') + ')';
    }
    public get propSplit(): ISplitProps['split'] {
        if (this.direction == SplitDirection.undefined) {
            return undefined;
        }
        // @ts-ignore
        return SplitDirection[this.direction];
    }
    public toString() {
        return `A(${this.children.toString()})`;
    }
    public find(key: number): PrimaryPanel | undefined {
        for (let child of this.children) {
            if (isPrimaryPanel(child)) {
                if (child.key == key) {
                    return child;
                }
            } else {
                let found = child.find(key);
                if (found) {
                    return found;
                }
            }
        }
        return undefined;
    }
    public split(key: number, direction: SplitDirection) {
        if (this.children.length == 0) {
            throw new Error(`PrimaryArea.split(): children is empty.`);
        }
        // find the window to split
        let index = this.children.findIndex(node => isPrimaryPanel(node) && node.key == key);
        let child = this.children[index] as PrimaryPanel;
        if (index == -1) {
            throw new Error(`PrimaryArea.split(): failed to find window with key=${key}.`);
        }
        // check the direction
        if (this.direction == SplitDirection.undefined) {
            if (this.children.length > 1) {
                throw new Error(`PrimaryArea.split(): has been splitted but direction unset.`);
            }
            this.direction = direction;
        }
        // if split in the same direction, then directly push the new children;
        // otherwise, a new area is created to replace the splitted window.
        if (this.direction == direction) {
            let splitted = new PrimaryPanel(this);
            splitted.changeSnapshot(child.getCurrentSnapshot());
            splitted.changeViewname(child.getCurrentViewname());
            splitted.resetCurrentViewAttrs(child.getCurrentViewAttrs());
            // this.children.splice(isForward ? index : index + 1, 0, splitted);
            this.children.splice(index + 1, 0, splitted);
        } else {
            let splitted = new PrimaryArea(this, [child]);
            this.children[index] = splitted;
            child.split(direction);
        }
    }
    public removeChild(key: number) {
        this.children = this.children.filter(node => node.key != key);
    }
    public replaceChild(replacedNode: PrimaryArea | PrimaryPanel, newNode: PrimaryArea | PrimaryPanel) {
        this.children = this.children.map(child => child.key == replacedNode.key ? newNode : child);
        newNode.parent = this;
    }
}

// it is preferred not to use a static field in the class, since it may trigger an hydration warning,
// and it might take much more progress to eliminate the warning.
let PanelNextKey = 0;

abstract class Panel {
    public diagramRef?: null
}

export class PrimaryPanel extends Panel {
    public readonly key: number
    public parent: PrimaryArea
    protected snKey?: string
    protected viewname?: string
    protected viewAttrs: {
        [viewName: string]: ViewAttrs
    }
    protected selectedObject?: string;
    constructor(parent: PrimaryArea) {
        super();
        this.key = PanelNextKey ++;
        this.parent = parent;
        this.viewAttrs = {};
    }
    public toString() {
        return `W(${this.key})`
    }
    public get displayed(): DisplayOption {
        let displayed: DisplayOption = {
            snKey: this.snKey,
            viewname: this.viewname,
            viewAttrs: {}
        };
        if (this.viewname !== undefined) {
            displayed.viewAttrs = this.viewAttrs[this.viewname];
        }
        return displayed;
    }
    public getCurrentSnapshot = (): string | undefined => this.snKey;
    public getCurrentViewname = (): string | undefined => this.viewname;
    public getSelectedObject  = (): string | undefined => this.selectedObject;
    public changeSnapshot = (snKey: string | undefined) => this.snKey = snKey;
    public changeViewname = (viewname: string | undefined) => this.viewname = viewname;
    public changeSelectedObject = (objectKey: string | undefined) => this.selectedObject = objectKey;
    public getCurrentViewAttrs(): ViewAttrs {
        if (this.viewname === undefined) {
            return {};
        }
        return this.viewAttrs[this.viewname];
    }
    public updateCurrentViewAttrs(attrs: ViewAttrs) {
        if (this.viewname === undefined) {
            throw new Error(`panel.updateAttrs(): viewname is not set on panel #${this.key}.`);
        }
        this.viewAttrs[this.viewname] = {
            ...this.viewAttrs[this.viewname] || {},
            ...attrs
        };
    }
    public resetCurrentViewAttrs(attrs: ViewAttrs) {
        if (this.viewname === undefined) {
            throw new Error(`panel.reset(): viewname is not set on panel #${this.key}.`);
        }
        this.viewAttrs[this.viewname] = { ...attrs };
    }
    public split(direction: SplitDirection) {
        this.parent.split(this.key, direction);
    }
}

export class SecondaryPanel extends Panel {
    public readonly key: number
    public readonly viewname: string
    public readonly objectKey: string
    constructor(viewname: string, objectKey: string) {
        super();
        this.key = PanelNextKey ++;
        this.viewname = viewname;
        this.objectKey = objectKey;
    }
    toString() {
        return `<${this.key}>`
    }
}

export type DisplayOption = {
    snKey?:    string
    viewname?: string
    viewAttrs: ViewAttrs
}

export function isPrimaryArea(node: PrimaryArea | PrimaryPanel): node is PrimaryArea {
    return (node as PrimaryArea).direction !== undefined;
}

export function isPrimaryPanel(node: PrimaryArea | PrimaryPanel): node is PrimaryPanel {
    return !isPrimaryArea(node);
}

export enum Direction {
    left,
    up,
    down,
    right,
}

export enum SplitDirection {
    undefined,
    vertical,
    horizontal,
}
