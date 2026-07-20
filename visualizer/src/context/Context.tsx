import { createContext, useReducer } from "react";
import Snapshots from "./Snapshots";
import Panels, { DisplayOption, SplitDirection } from "./Panels";
import { Snapshot, ViewAttrs } from "@app/visual/types";
import { addLogTo, LogEntry, LogType } from "@app/utils";

class GlobalState {
    snapshots: Snapshots;
    panels: Panels;
    logs: LogEntry[]
    constructor(snapshots: Snapshots, panels: Panels, logs: LogEntry[]) {
        this.snapshots = snapshots;
        this.panels    = panels;
        this.logs      = logs;
    }
    getPlot(displayed: DisplayOption) {
        const snKey    = displayed.snKey;
        const viewname = displayed.viewname;
        const view = this.snapshots.getView(snKey, viewname);
        if (view === null) {
            return { view: null, attrs: {} };
        }
        let attrs: ViewAttrs = {
            ...view.init_attrs,
            ...displayed.viewAttrs
        };
        return { view, attrs };
    }
    log(type: LogType, message: string) {
        addLogTo(this.logs, type, message);
    }
    refresh() {
        return new GlobalState(this.snapshots, this.panels, this.logs);
    }
    static create() {
        return new GlobalState(new Snapshots(), new Panels(), []);
    }
}

const initialState = GlobalState.create();

export type GlobalStateAction =
| { command: 'NEW',    snKey: string, snapshot: Snapshot, pc: string, timestamp: string }
| { command: 'DIFF',   snKeySrc: string, snKeyDst: string, trackedAddrs: number[] }
| { command: 'SPLIT',  pKey: number, direction: SplitDirection }
| { command: 'PICK',   pKey: number, objectKey: string }
| { command: 'USE',    pKey: number, snKey: string }
| { command: 'SWITCH', pKey: number, viewname: string }
| { command: 'UPDATE', pKey: number, attrs: ViewAttrs }
| { command: 'RESET',  pKey: number }
| { command: 'SELECT', pKey: number, objectKey: string | undefined }
| { command: 'REMOVE', pKey: number }

// export const GlobalStatusContext = createContext(new GlobalStatus());
export const GlobalStateContext = createContext<{
    state: GlobalState;
    stateDispatch: React.Dispatch<GlobalStateAction>;
}>({
    state: initialState,
    stateDispatch: () => null
});

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
    const [state, stateDispatch] = useReducer(
        globalStateReducer,
        initialState
    );
    return (
        <GlobalStateContext.Provider value={{state, stateDispatch}}>
            {children}
        </GlobalStateContext.Provider>
    );
}

function globalStateReducer(state: GlobalState, action: GlobalStateAction) {
    try {
        return globalStateDispatcher(state, action);
    } catch (error) {
        state.log('error', error instanceof Error ? error.message : String(error));
        return state.refresh();
    }
}

function globalStateDispatcher(state: GlobalState, action: GlobalStateAction) {
    switch (action.command) {
        case 'NEW':
            console.log(`NEW ${action.snKey} ${action.snapshot.pc} ${action.snapshot.timestamp}`);
            state.snapshots.new(action.snKey, action.snapshot);
            return state.refresh();
        case 'DIFF':
            console.log(`DIFF ${action.snKeySrc} ${action.snKeyDst} ${action.trackedAddrs.length}`);
            state.snapshots.diff(action.snKeySrc, action.snKeyDst, action.trackedAddrs);
            return state.refresh();
        case 'SPLIT':
            console.log(`SPLIT ${action.pKey} ${action.direction}`);
            state.panels.split(action.pKey, action.direction);
            return state.refresh();
        case 'PICK':
            console.log(`PICK ${action.pKey} ${action.objectKey}`);
            state.panels.pick(action.pKey, action.objectKey);
            return state.refresh();
        case 'USE':
            console.log(`USE ${action.pKey} ${action.snKey}`);
            state.panels.use(action.pKey, action.snKey);
            return state.refresh();
        case 'SWITCH':
            console.log(`SWITCH ${action.pKey} ${action.viewname}`);
            state.panels.switch(action.pKey, action.viewname);
            return state.refresh();
        case 'UPDATE':
            console.log(`UPDATE ${action.pKey} ${JSON.stringify(action.attrs)}`);
            state.panels.update(action.pKey, action.attrs);
            return state.refresh();
        case 'RESET':
            console.log(`RESET ${action.pKey}`);
            state.panels.reset(action.pKey);
            return state.refresh();
        case 'SELECT':
            console.log(`SELECT ${action.pKey} ${action.objectKey}`);
            state.panels.select(action.pKey, action.objectKey);
            return state;
        case 'REMOVE':
            console.log(`REMOVE ${action.pKey}`);
            state.panels.remove(action.pKey);
            return state.refresh();
        default:
            throw new Error('unknown action: ' + JSON.stringify(action));
    }
}
