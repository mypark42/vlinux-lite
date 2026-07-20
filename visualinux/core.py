from visualinux import *
from visualinux.dsl.parser.parser import Parser
from visualinux.dsl.model.symtable import *
from visualinux.runtime.gdb.adaptor import gdb_adaptor
from visualinux.snapshot import *
from visualinux.vdiff_monitor import VDiffMonitor

import json
import shutil
import requests
from datetime import datetime

import cProfile, pstats, io
from pstats import SortKey

VIEWCL_GRAMMAR_PATH = DSL_GRAMMAR_DIR / 'viewcl.lark'

class Core:
    '''Note that there should be only one Engine instance existing.
    '''
    def __init__(self) -> None:
        self.parser = Parser(VIEWCL_GRAMMAR_PATH)
        self.sn_manager = SnapshotManager()
        self.vdiff_monitor = VDiffMonitor()

    def parse_file(self, src_file: Path):
        return self.parse(src_file.read_text())

    def parse(self, code: str):
        model = self.parser.parse(code)
        return model

    def sync_file(self, sn_key: str | None, src_file: Path, if_export: bool = False):
        return self.sync(sn_key, src_file.read_text(), if_export)

    def sync(self, sn_key: str | None, code: str, if_export: bool = False):
        ''' The start point of ViewCL parsing and object graph extraction.
        '''
        if vl_debug_on(): printd(f'vl_sync()')
        gdb_adaptor.reset()
        KValue.reset()
        SymTable.reset()

        pr = cProfile.Profile()
        pr.disable()
        if vl_perf_on():
            pr.enable()

        try:
            model = self.parse(code)
            snapshot = model.sync()
        except Exception as e:
            print(f'vl_sync() unhandled exception: ' + str(e))
            snapshot = Snapshot()

        if vl_debug_on(): printd(f'vl_sync(): view sync OK')
        if vl_perf_on():
            pr.disable()
            s = io.StringIO()
            sortby = SortKey.CUMULATIVE
            ps = pstats.Stats(pr, stream=s).sort_stats(sortby)
            ps.print_stats()
            ps.dump_stats(VL_DIR / 'tmp' / 'visualinux-sync.perf')
            # print(s.getvalue())

        if sn_key is None:
            sn_key = self.sn_manager.alloc_anon_key()
        snapshot.key = sn_key
        self.sn_manager.set(sn_key, snapshot)

        self.send({
            'command': 'NEW',
            'snKey': sn_key,
            'snapshot': snapshot.to_json(),
        })
        if if_export or vl_debug_on():
            TMP_DIR.mkdir(exist_ok=True)
            EXPORT_DIR.mkdir(exist_ok=True)
            timestamp = datetime.now().strftime('%m%d-%H%M%S')
            export_dir = EXPORT_DIR / timestamp
            export_dir.mkdir(exist_ok=True)
            for view in snapshot.views:
                print(f'--export {view.name}.json')
                self.export_for_debug(view.to_json(), export_dir / f'{view.name}.json')
            # self.reload_and_reexport_debug()

        # update tracked addresses for vdiff monitor
        if self.vdiff_monitor.enabled:
            try:
                if self.vdiff_monitor.bpf_map.value == 0:
                    print(f'vl_sync() vdiff monitor init')
                    self.__init_vdiff_monitor()
                    print(f'vl_sync() vdiff monitor init OK')
                self.vdiff_monitor.begin_sync(sn_key)
                self.__update_vdiff_monitor(snapshot)
                self.vdiff_monitor.end_sync()
                # # debug
                # gdb_adaptor.reset()
                # KValue.reset()
                # SymTable.reset()
                # ss = self.__fetch_bpf_map_snapshot()
                # ss.key = sn_key + '_vdiff_monitor_debug'
                # self.send({
                #     'command': 'NEW',
                #     'snKey': ss.key,
                #     'snapshot': ss.to_json(),
                # })

            except Exception as e:
                print(f'vl_sync() vdiff monitor update failed: {e!s}')
                self.vdiff_monitor.enabled = False

        return snapshot

    def __init_vdiff_monitor(self):
        snapshot = self.__fetch_bpf_map_snapshot()
        for box in snapshot.views[0].pool.boxes.values():
            if box.type == 'bpf_map':
                print('bpf_map box found: ', box.addr)
                member_json = box.views['default'].members['name'].to_json()
                print('    member_json:', member_json)
                if member_json['class'] == 'text' and member_json['value'] == 'vdiff_tracked':
                    print('bpf_map vdiff_tracked found: ', box.addr)
                    self.vdiff_monitor.bpf_map.value = box.addr
    
    def __fetch_bpf_map_snapshot(self):
        bpf_vcl = VIEWCL_SRC_DIR / 'sysdep' / 'bpf.vcl'
        code = bpf_vcl.read_text()
        model = self.parse(code)
        snapshot = model.sync()
        return snapshot

    def __update_vdiff_monitor(self, snapshot: Snapshot):
        tracked_addrs: list[int] = []
        for view in snapshot.views:
            for box in view.pool.boxes.values():
                tracked_addrs.append(box.addr)
            for box in view.pool.containers.values():
                tracked_addrs.append(box.addr)
        self.vdiff_monitor.update(tracked_addrs)

    def send_diff(self, sn_key_src: str, sn_key_dst: str):
        self.send({
            'command': 'DIFF',
            'snKeySrc': sn_key_src,
            'snKeyDst': sn_key_dst,
            'trackedAddrs': self.vdiff_monitor.get_tracked_addrs(sn_key_src, sn_key_dst)
        })

    def send(self, json_data: dict):
        server_url = f'http://localhost:{VISUALIZER_PORT}'
        url = f'{server_url}/vcmd'
        headers = {'Content-type': 'application/json', 'Accept': 'text/plain'}
        try:
            response = requests.post(url, headers=headers, json=json_data)
            print(f'POST to visualizer {response}')
        except Exception as e:
            print(f'[ERROR] Failed to POST data to visualizer; please check the connection.')
            print(f'- {e!s}')
            print(f'- {url = }')

    def export_for_debug(self, json_data: dict, path: Path):
        with open(path, 'w') as f:
            json.dump(json_data, f, indent=4)

    def import_for_debug(self, path: Path) -> dict:
        with open(path, 'r') as f:
            return json.load(f)

    def reload_and_reexport_debug(self):
        DUMP_DIR = VL_DIR / 'visualizer' / 'public' / 'statedump'
        DUMP_DIR.mkdir(exist_ok=True)
        print(f'vl_sync(): data export')
        full_json_data = {}
        for path in DUMP_DIR.glob('**/*.json'):
            full_json_data[path.stem] = self.import_for_debug(path)
        if (DUMP_DIR / 'latest.json').is_file():
            shutil.copy(DUMP_DIR / 'latest.json', DUMP_DIR / 'old.json')
        self.export_for_debug(full_json_data, DUMP_DIR / 'latest.json')
        print(f'vl_sync(): data export OK')

core = Core()
