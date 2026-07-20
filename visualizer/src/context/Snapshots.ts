import { calcSnapshotDiff } from "@app/visual/diff";
import { Snapshot } from "@app/visual/types";
import { preprocess } from "@app/visual/preprocess";

// we use the word "snapshot" instead of "state" to avoid confusion with the React concept of "state"
// this is actually the state diff mentioned in our paper/docs
export default class Snapshots {
    data: Snapshot[]
    dataIndex: Map<string, number>
    constructor(data: Snapshot[] = []) {
        this.data = data;
        this.dataIndex = new Map();
    }
    //
    // context APIs
    //
    new(snKey: string, snapshot: Snapshot) {
        console.log('new snapshot', snKey, snapshot);
        // preprocess
        preprocess(snapshot);
        // reorder views
        let orderedViews = Object.keys(snapshot.views).sort().reduce((obj: any, key) => { 
            obj[key] = snapshot.views[key]; 
            return obj;
        }, {});
        snapshot.views = orderedViews;
        // store
        this.data.push(snapshot);
        this.dataIndex.set(snKey, this.data.length - 1);
        console.log('new snapshot OK', snKey, snapshot);
    }
    diff(snKeySrc: string, snKeyDst: string, trackedAddrs: number[]) {
        const diffKey = `diff-${snKeySrc}-${snKeyDst}`;
        if (this.has(diffKey)) {
            return this.get(diffKey);
        }
        const snSrc = this.get(snKeySrc);
        const snDst = this.get(snKeyDst);
        if (snSrc === null) return snDst;
        if (snDst === null) return snSrc;
        const snDiff = calcSnapshotDiff(diffKey, snSrc, snDst, trackedAddrs);
        this.new(diffKey, snDiff);
    }
    //
    //
    //
    getView(snKey: string | undefined, viewname: string | undefined) {
        if (snKey === undefined || viewname === undefined) {
            return null;
        }
        const plot = this.get(snKey);
        return plot.views[viewname];
    }
    getViewnameList(snKey: string | undefined): string[] {
        if (snKey === undefined) {
            return [];
        }
        const plot = this.get(snKey);
        if (plot === null) {
            return [];
        }
        return Object.keys(plot.views);
    }
    //
    // utilities
    //
    isEmpty() {
        return this.data.length === 0;
    }
    has(snKey: string) {
        return this.dataIndex.has(snKey);
    }
    get(snKey: string) {
        const index = this.dataIndex.get(snKey);
        if (index === undefined) {
            throw new Error(`snapshots.get(): snapshot ${snKey} not found`);
        }
        return this.data[index];
    }
}
