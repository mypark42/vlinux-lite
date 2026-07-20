from visualinux import *
from visualinux.runtime import entity
from visualinux.dsl.parser.viewql_units import ViewQLCode
from visualinux.snapshot.attrs_manager import ViewAttrsManager

class Pool:

    def __init__(self) -> None:
        self.boxes: dict[str, entity.Box] = {}
        self.containers: dict[str, entity.Container | entity.ContainerConv] = {}
        self.__next_vbox_addr: int = 0

    def add_box(self, ent: entity.Box) -> None:
        self.__add_check(ent)
        if vl_debug_on(): printd(f'pool.add_box({ent.key})')
        self.boxes[ent.key] = ent

    def add_container(self, ent: entity.Container | entity.ContainerConv) -> None:
        self.__add_check(ent)
        if vl_debug_on(): printd(f'pool.add_container({ent.key})')
        self.containers[ent.key] = ent

    def __add_check(self, ent: entity.NotPrimitive) -> None:
        if ent.key in self.boxes:
            raise fuck_exc(AssertionError, f'duplicated key {ent.key} in pool.boxes: {ent = !s}, existed: {self.boxes[ent.key]!s}')
        if ent.key in self.containers:
            raise fuck_exc(AssertionError, f'duplicated key {ent.key} in pool.containers: {ent = !s}, existed: {self.containers[ent.key]!s}')

    def find(self, key: str | None) -> entity.NotPrimitive | None:
        if key is None:
            return None
        if key in self.boxes:
            return self.boxes[key]
        if key in self.containers:
            return self.containers[key]
        return None

    def find_box(self, key: str | None) -> entity.Box | None:
        if key is None:
            return None
        if key in self.containers:
            raise fuck_exc(AssertionError, f'try to find_box {key = } but found in {self.containers = !s}')
        if key in self.boxes:
            return self.boxes[key]
        return None

    def find_container(self, key: str | None) -> entity.Container | None:
        if key is None:
            return None
        if key in self.boxes:
            raise fuck_exc(AssertionError, f'try to find_container {key = } but found in {self.boxes = !s}')
        if key in self.containers:
            ent = self.containers[key]
            if not isinstance(ent, entity.Container):
                raise fuck_exc(AssertionError, f'find_container {key = } but not an ent.Container: {ent = !s}')
            return ent
        return None

    def find_container_conv(self, key: str) -> entity.ContainerConv | None:
        if key in self.boxes:
            raise fuck_exc(AssertionError, f'try to find_container {key = } but found in {self.boxes = !s}')
        if key in self.containers:
            ent = self.containers[key]
            if not isinstance(ent, entity.ContainerConv):
                raise fuck_exc(AssertionError, f'find_container {key = } but not an ent.ContainerConv: {ent = !s}')
            return ent
        return None

    def gen_vbox_addr(self) -> int:
        '''Generate a fake, unique root address for VBox whose root is None.
        '''
        self.__next_vbox_addr -= 1
        return self.__next_vbox_addr

    def to_json(self) -> dict[str, dict]:
        return {
            'boxes':
                dict((key, ent.to_json()) for key, ent in self.boxes.items()),
            'containers':
                dict((key, ent.to_json()) for key, ent in self.containers.items())
        }

class StateView:

    def __init__(self, name: str, error: bool = True) -> None:
        self.name = name
        self.pool = Pool()
        self.plot: list[str] = []
        self.error = error
        self.db_attrs = ViewAttrsManager()

    def add_plot(self, key: str) -> None:
        self.plot.append(key)

    def do_postprocess(self) -> None:
        self.__set_parent()
        self.__set_vkey()
        self.__init_attr_manager()

    def __set_parent(self) -> None:
        for key, ent in self.pool.boxes.items():
            ent.parent = None
        for key, ent in self.pool.containers.items():
            ent.parent = None
        for key, ent in self.pool.boxes.items():
            for view in ent.views.values():
                for member in view.members.values():
                    if isinstance(member, entity.BoxMember):
                        if member.object_key is None:
                            continue
                        ent_child = self.pool.find(member.object_key)
                        if not ent_child:
                            raise fuck_exc(AssertionError, f'entity not found for boxmember {member!s} of box {key}')
                        ent_child.parent = key
                        if vl_debug_on(): printd(f':{view.name} set_parent {ent_child.key=} .parent= {key=}')
        for key, ent in self.pool.containers.items():
            if isinstance(ent, entity.ContainerConv):
                continue
            for member in ent.members:
                if member.key is None:
                    continue
                ent_child = self.pool.find(member.key)
                if not ent_child:
                    raise fuck_exc(AssertionError, f'entity not found for {member.key = } of container {key}')
                ent_child.parent = key
                if vl_debug_on(): printd(f'container set_parent {ent_child.key=} .parent= {key=}')

    def __set_vkey(self) -> None:
        vkey_map: dict[str, str] = {}
        #
        visited: set[str] = set()
        for key in self.plot:
            self.__calc_new_vkey(key, vkey_map, visited)
        if vl_debug_on(): printd(f'{self.name} vkey_map:')
        for key, new_key in vkey_map.items():
            if vl_debug_on(): printd(f'  | {key} -> {new_key}')
        #
        for key, new_key in vkey_map.items():
            if key == new_key:
                print(f'{self.name} warning: vkey_map [{key} -> {new_key}] is the same')
                continue
            if key in self.pool.boxes:
                self.pool.boxes[new_key] = self.pool.boxes[key]
                self.pool.boxes[new_key].key = new_key
                del self.pool.boxes[key]
            elif key in self.pool.containers:
                self.pool.containers[new_key] = self.pool.containers[key]
                self.pool.containers[new_key].key = new_key
                del self.pool.containers[key]
            else:
                raise fuck_exc(AssertionError, f'object not found for {key = }')
        #
        for key, box in self.pool.boxes.items():
            for view in box.views.values():
                for member in view.members.values():
                    if isinstance(member, entity.Link) and member.target_key in vkey_map:
                        member.target_key = vkey_map[member.target_key]
                    if isinstance(member, entity.BoxMember) and member.object_key in vkey_map:
                        member.object_key = vkey_map[member.object_key]
            if box.parent in vkey_map:
                box.parent = vkey_map[box.parent]
        #
        for key, container in self.pool.containers.items():
            for member in container.members:
                if member.key in vkey_map:
                    member.key = vkey_map[member.key]
                for link in member.links.values():
                    if link.target_key in vkey_map:
                        link.target_key = vkey_map[link.target_key]
            if container.parent in vkey_map:
                container.parent = vkey_map[container.parent]
            

    def __calc_new_vkey(self, key: str, vkey_map: dict[str, str], visited: set[str], prefix: str = '__virtual_') -> None:
        # check visited
        if key in visited:
            return
        visited.add(key)
        # if box
        if key in self.pool.boxes:
            box = self.pool.boxes[key]
            # update prefix
            if box.addr < 0:
                prefix += f'|{box.label}'
                vkey_map[key] = prefix
            else:
                prefix += f'|{box.key}'
            # dfs box
            for view in box.views.values():
                for member in view.members.values():
                    if isinstance(member, entity.Link) and member.target_key is not None:
                        self.__calc_new_vkey(member.target_key, vkey_map, visited, prefix)
                    if isinstance(member, entity.BoxMember) and member.object_key is not None:
                        self.__calc_new_vkey(member.object_key, vkey_map, visited, prefix)
            # dfs parent
            if box.parent is not None:
                parent_prefix = prefix.rsplit('|', 1)[0] if '|' in prefix else prefix
                self.__calc_new_vkey(box.parent, vkey_map, visited, parent_prefix)
        # if container
        elif key in self.pool.containers:
            container = self.pool.containers[key]
            # update prefix
            if container.addr < 0:
                prefix += f'|{container.label}'
                vkey_map[key] = prefix
            else:
                prefix += f'|{container.key}'
            # dfs container
            for member in container.members:
                if member.key is not None:
                    self.__calc_new_vkey(member.key, vkey_map, visited, prefix)
            # dfs parent
            if container.parent is not None:
                parent_prefix = prefix.rsplit('|', 1)[0] if '|' in prefix else prefix
                self.__calc_new_vkey(container.parent, vkey_map, visited, parent_prefix)
            if isinstance(container, entity.ContainerConv):
                self.__calc_new_vkey(container.source.key, vkey_map, visited, prefix)
        # exception
        else:
            raise fuck_exc(AssertionError, f'object not found for {key = }')

    def __init_attr_manager(self) -> None:
        for box in self.pool.boxes.values():
            self.db_attrs.insert_box(box)
        for container in self.pool.containers.values():
            self.db_attrs.insert_container(container)

    def intp_viewql(self, viewql: ViewQLCode) -> None:
        try:
            self.db_attrs.intp_viewql(viewql)
        except Exception as e:
            print(f'[ERROR] unknown exception in intp_viewql: {e!s}')

    def to_json(self) -> dict:
        return {
            'name': self.name,
            'pool': self.pool.to_json(),
            'plot': self.plot,
            'init_attrs': self.db_attrs.to_json(),
            'stat': int(self.error),
        }
