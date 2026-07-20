from visualinux import *
from visualinux.dsl.parser.viewql_units import *
from visualinux.runtime.entity import *
from tinydb import TinyDB, Query,where
from tinydb.storages import MemoryStorage

Typemap = dict[str, str] # field name -> field type
Scope   = dict[str, set[str]]

class ViewAttrsManager:

    def __init__(self) -> None:
        # the memdb is used separately:
        # - the default table is used for update
        # - the type-specific tables are used for query
        self.memdb = TinyDB(storage=MemoryStorage)
        self.typemaps: dict[str, Typemap] = {}

    def insert_box(self, box: Box) -> None:
        typemap = self.typemaps.setdefault(box.type, {})
        members: dict[str, Any] = {}
        reachable: list[str] = []
        for view in box.views.values():
            for label, member in view.members.items():
                if label in members:
                    raise fuck_exc(KeyError, f'duplicate member {label} in box {box!s}')
                if isinstance(member, Text):
                    members[label] = member.real_value
                elif isinstance(member, Link):
                    members[label] = member.target_key
                    if member.target_key:
                        reachable.append(member.target_key)
                        typemap[label] = member.target_type
                elif isinstance(member, BoxMember):
                    members[label] = member.object_key
                    if member.object_key:
                        reachable.append(member.object_key)
                        typemap[label] = member.object_type
                else:
                    raise fuck_exc(TypeError, f'unknown member type {member!s}')
        entry = {
            '$key': box.key, '$addr': box.addr, '$type': box.type, '$parent': box.parent
        } | members
        entry['$reachable'] = reachable
        self.memdb.insert(entry)
        self.memdb.table(box.type).insert(entry)

    def insert_container(self, container: Container | ContainerConv) -> None:
        entry = {
            '$key': container.key, '$addr': container.addr, '$type': container.type, '$parent': container.parent,
            '$members': [member.key for member in container.members if member.key is not None]
        }
        entry['$reachable'] = entry['$members']
        self.memdb.insert(entry)
        self.memdb.table(container.type).insert(entry)

    def intp_viewql(self, viewql: ViewQLCode) -> None:
        scope: Scope = {}
        for stmt in viewql.stmts:
            if isinstance(stmt, Select):
                self.intp_select(stmt, scope)
            elif isinstance(stmt, Update):
                self.intp_update(stmt, scope)
            else:
                raise fuck_exc(TypeError, f'unknown stmt type {stmt!s}')

    def intp_select(self, stmt: Select, scope: Scope) -> None:
        if vl_debug_on(): printd(f'--intp {stmt!s}')
        # find the table of the specified object type
        if stmt.selector.head == '*':
            table = self.memdb
            scope_query = Query().noop()
        else:
            table = self.memdb.table(stmt.selector.head)
            # start from the specified object set
            if stmt.scope == '*':
                object_keys = None
            else:
                object_keys = self.__eval_set_expr(scope, stmt.scope)
            # iterate to filter objects
            for suffix in stmt.selector.suffix:
                field_name = suffix.identifier
                field_type = self.__get_field_type_of(table.name, field_name)
                if field_type is None:
                    scope[stmt.object_set] = set()
                    return # no satisfied objects
                if object_keys is not None:
                    objects = table.search(where('$key').one_of(list(object_keys)))
                else:
                    objects = table.all()
                object_keys = {obj[field_name] for obj in objects}
                table = self.memdb.table(field_type)
            #
            scope_query = where('$key').one_of(list(object_keys)) if object_keys else Query().noop()

        cond_query = self.__eval_cond_expr(scope, stmt.condition, stmt.alias) if stmt.condition else Query().noop()

        if vl_debug_on():
            printd(f'~~ {table.name=!s} {scope_query=!s} {cond_query=!s}')
            printd(f'~~ {table.all()=!s}')
            printd(f'~~ {table.search(scope_query)=!s}')
            printd(f'~~ {table.search(cond_query)=!s}')
            printd(f'~~ {table.search(scope_query & cond_query)=!s}')
            for obj in table.all():
                printd(f'    ~~ obj: {obj}')
                if cond_query != Query().noop():
                    printd(f'    ~~ matches condition: {cond_query(obj)}')

        result = table.search(scope_query & cond_query)
        result_keys = set(obj['$key'] for obj in result)
        scope[stmt.object_set] = result_keys
        if vl_debug_on(): printd(f'! scope[{stmt.object_set}] = {result_keys!s}')

    def intp_update(self, stmt: Update, scope: Scope) -> None:
        if vl_debug_on(): printd(f'--intp {stmt!s}')
        object_keys = self.__eval_set_expr(scope, stmt.set_expr)
        if vl_debug_on(): printd(f'--intp on {object_keys=!s}')
        self.memdb.update({f'^{stmt.attr_name}': stmt.attr_value}, where('$key').one_of(list(object_keys)))

    def __get_field_type_of(self, object_type: str, field_name: str) -> str | None:
        if typemap := self.typemaps.get(object_type):
            return typemap.get(field_name)
        return None

    def __eval_set_expr(self, scope: Scope, setexpr: str | SetFn | SetOpt) -> set[str]:
        if isinstance(setexpr, str):
            return scope[setexpr]
        if isinstance(setexpr, SetFn):
            return self.__eval_set_fn(scope, setexpr)
        # calculate children
        lhs = set(self.__eval_set_expr(scope, setexpr.lhs))
        rhs = set(self.__eval_set_expr(scope, setexpr.rhs))
        # evaluate set operation
        if setexpr.opt == '^':
            return lhs.intersection(rhs)
        if setexpr.opt == '|':
            return lhs.union(rhs)
        if setexpr.opt == '\\':
            return lhs.difference(rhs)
        raise fuck_exc(ValueError, f'unknown setopt {setexpr!s}')

    def __eval_set_fn(self, scope: Scope, setfn: SetFn) -> set[str]:
        if setfn.fn == 'REACHABLE':
            reachable = scope[setfn.set_expr]
            new_reachable: set[str] = set()
            loopcnt = 0
            while loopcnt < 1000:
                loopcnt += 1
                new_reachable = set(reachable)
                for reached in self.memdb.search(where('$key').one_of(list(reachable))):
                    for new_key in reached['$reachable']:
                        new_reachable.add(new_key)
                if reachable == new_reachable:
                    break
                if len(reachable) == len(new_reachable):
                    break
                reachable = new_reachable
            if loopcnt >= 1000:
                raise fuck_exc(RuntimeError, f'eval_set_fn REACHABLE: unterminated loop')
            return reachable
        raise fuck_exc(ValueError, f'unknown setfn {setfn!s}')

    def __eval_cond_expr(self, scope: Scope, cond: CondOpt | Filter, alias: str | None):
        # for primitive cond expr synthesize a tinydb query
        if isinstance(cond, Filter):
            # extract lhs: tinydb query instance
            if cond.lhs.head == alias:
                if not cond.lhs.suffix:
                    lhs_query = where('$addr')
                else:
                    lhs_query = Query()
            else:
                lhs_query = where(cond.lhs.head)
            for suffix in cond.lhs.suffix:
                lhs_query = lhs_query[suffix.identifier]
            # extract rhs: string
            rhs_value = cond.rhs.value()
            if isinstance(rhs_value, str) and rhs_value.startswith('"') and rhs_value.endswith('"'):
                rhs_value = rhs_value[1 : -1]
            # return
            return self.__eval_cond_opt(scope, lhs_query, rhs_value, cond.opt)
        # validity check
        if not isinstance(cond.lhs, CondOpt | Filter) or not isinstance(cond.rhs, CondOpt | Filter):
            raise fuck_exc(TypeError, f'illegal cond expr {cond!s}')
        # synthesize children
        lhs = self.__eval_cond_expr(scope, cond.lhs, alias)
        rhs = self.__eval_cond_expr(scope, cond.rhs, alias)
        # evaluate logical operation
        if cond.opt == 'AND':
            return lhs & rhs
        if cond.opt == 'OR':
            return lhs | rhs
        raise fuck_exc(ValueError, f'unknown cond opt {cond.opt!s}')

    def __eval_cond_opt(self, scope: Scope, lhs_query: Query, rhs_value: int | bool | str | None, opt: str):
        def eval_cond_opt_as_numeric(val: Any, op: str, rhs: Any) -> bool:
            try:
                num_lhs = val_to_numeric(val)
                num_rhs = val_to_numeric(rhs)
                if op == '>':  return num_lhs >  num_rhs
                if op == '<':  return num_lhs <  num_rhs
                if op == '>=': return num_lhs >= num_rhs
                if op == '<=': return num_lhs <= num_rhs
                if op == '==': return num_lhs == num_rhs
                if op == '!=': return num_lhs != num_rhs
                raise fuck_exc(TypeError, f'unknown cond opt {opt!s}')
            except (ValueError, TypeError, KeyError) as e:
                return False
        if is_val_numeric(rhs_value):
            return lhs_query.test(lambda x: eval_cond_opt_as_numeric(x, opt, val_to_numeric(rhs_value)))
        if opt == '>':  return lhs_query >  rhs_value
        if opt == '<':  return lhs_query <  rhs_value
        if opt == '>=': return lhs_query >= rhs_value
        if opt == '<=': return lhs_query <= rhs_value
        if opt == '==': return lhs_query == rhs_value
        if opt == '!=': return lhs_query != rhs_value
        if opt == 'IN': return lhs_query.one_of(list(scope[str(rhs_value)]))
        raise fuck_exc(TypeError, f'illegal cond opt {opt!s}')

    def to_json(self) -> dict:
        objects = self.memdb.all()
        data = {}
        for obj in objects:
            if attrs := { attr[1:]: obj[attr] for attr in obj.keys() if attr.startswith('^') }:
                data[obj['$key']] = attrs
        return data

# utils for cond expr evaluation

def is_val_hexdigit(val: str) -> bool:
    if len(val) <= 2 or not val.startswith('0x'):
        return False
    return all(c in '0123456789abcdef' for c in val[2 :])

def is_val_numeric(val: Any) -> bool:
    if isinstance(val, int):
        return True
    if not isinstance(val, str):
        return False
    return val.isdigit() or is_val_hexdigit(val)

def val_to_numeric(val: Any) -> int:
    if isinstance(val, str):
        if is_val_hexdigit(val):
            return int(val, 16)
        elif val == 'true':
            return 1
        elif val == 'false':
            return 0
    if isinstance(val, bool):
        return 1 if val else 0
    return int(val)
