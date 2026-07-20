from visualinux import *
from visualinux.runtime.gdb import gdb
from visualinux.runtime.kvalue import *

### basic

def offsetof(type_name: str, field_name: str) -> int:
    '''&((t *)0)->f
    '''
    gtype = GDBType.lookup(type_name)
    if gtype.is_scalar():
        raise fuck_exc(AssertionError, f'offsetof() applied on scalar type: {type_name}')
    gtype, offset = gtype.get_field_info(field_name)
    kobj = KValue(gtype, offset)
    return kobj.address

def container_of(ptr: KValue, type_name: str, member_name: str) -> KValue:
    '''((type *)((void *)ptr - (void *)offsetof(type, member)))
    '''
    if ptr.value == 0:
        return KValue(GDBType.lookup(type_name), 0)
    offset = offsetof(type_name, member_name)
    container_addr = ptr.address - offset
    return KValue(GDBType.lookup(type_name), container_addr)

NR_OPEN_DEFAULT = 64

# cast_to_array(id, type, length) ((struct type (*)[length])(id))
def cast_to_array(id: KValue, type: str, length: KValue | int) -> KValue:
    if vl_debug_on(): printd(f'try cast_to_array {id=} {type=} {length=}')
    if isinstance(length, KValue):
        if length.gtype.is_pointer():
            length = length.dereference()
        length = length.value
    if vl_debug_on(): printd(f'  => eval ((struct {type} (*)[{length}])({id.address}))')
    gval = gdb.parse_and_eval(f'((struct {type} (*)[{length}])({id.address}))')
    return KValue(GDBType(gval.type), id.address)

# cast_to_parray(id, type, length) ((struct type * (*)[length])(id))
def cast_to_parray(id: KValue, type: str, length: KValue | int) -> KValue:
    if vl_debug_on(): printd(f'try cast_to_parray {id=} {type=} {length=}')
    return cast_to_array(id, f'{type} *', length)

def get_bitfield(var: KValue, fieldname: str) -> KValue:
    value = gdb.Value(var.address).cast(var.gtype.inner)[fieldname]
    return KValue.FinalInt(GDBType.basic('int'), value)

### per-cpu access

LINUX_GDB_DIR = os.path.join(VL_DIR, 'kernel/scripts/gdb')
if LINUX_GDB_DIR not in sys.path:
    sys.path.insert(0, LINUX_GDB_DIR)

import linux.cpus

def current_cpu() -> KValue:
    value = linux.cpus.get_current_cpu()
    return KValue.FinalInt(GDBType.basic('int'), value)

# def per_cpu(var: KValue, cpu: KValue | int) -> KValue:
#     '''(*per_cpu_ptr(&(var), cpu))
#     '''
#     assert False

def per_cpu_ptr(ptr: KValue, cpu: KValue | int) -> KValue:
    '''((typeof(ptr))((uintptr_t)ptr + per_cpu_offset(cpu)))
       this hacking can speedup gdb but we haven't adapt it to kvm-enabled situ.
    '''
    if ptr.address == 0:
        return KValue(ptr.gtype, 0)
    address = (ptr.address + per_cpu_offset(cpu)) % (2**ptr_size)
    return KValue(ptr.gtype, address)

def per_cpu_offset(cpu: KValue | int) -> int:
    if isinstance(cpu, KValue):
        cpu = cpu.value
    gval = gdb.parse_and_eval(f'__per_cpu_offset[{cpu}]')
    return int(gval)

### specific per-cpu access for kgdb cases

def per_cpu_current_task(cpu: KValue | int) -> KValue:
    '''(*per_cpu_ptr(&(var), cpu))
    '''
    try:        # linux-6.x
        cpu_val = cpu.value if isinstance(cpu, KValue) else cpu
        ptr = linux.cpus.get_current_task(cpu_val).address
    except:
        try:    # linux-5.x
            ptr = gdb.parse_and_eval(f'per_cpu(current_task, {cpu!s})')
        except: # kgdb
            ptr = gdb.parse_and_eval(f'kgdb_info[{cpu!s}].task')
    return KValue(GDBType.lookup('task_struct'), int(ptr))
