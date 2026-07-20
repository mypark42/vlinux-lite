from visualinux import *
from visualinux.runtime.linux.jhash import *
from visualinux.runtime.linux.bpf import *

class JHashTest(gdb.Command):

    def __init__(self):
        super(JHashTest, self).__init__("jhash_test", gdb.COMMAND_USER)

    def invoke(self, arg, from_tty):
        argv = gdb.string_to_argv(arg)
        if len(argv) != 3:
            print("Usage: jhash_test <key> <length> <initval>")
            return
        key     = int(gdb.parse_and_eval(argv[0]))
        length  = int(gdb.parse_and_eval(argv[1]))
        initval = int(gdb.parse_and_eval(argv[2]))
        print(f"jhash({key}, {length}, {initval})")
        print(f"jhash({key}, {length}, {initval}) = {jhash(key, length, initval)}")

JHashTest()

class HTabUpdateTest(gdb.Command):

    def __init__(self):
        super(HTabUpdateTest, self).__init__("htab_update_test", gdb.COMMAND_USER)

    def invoke(self, arg, from_tty):
        argv = gdb.string_to_argv(arg)
        if len(argv) != 3:
            print("Usage: htab_update_test <map> <key> <value>")
            return
        map   = KValue(GDBType.lookup('bpf_map'), int(gdb.parse_and_eval(argv[0])))
        key   = KValue.gdb_eval(argv[1])
        value = KValue.gdb_eval(argv[2])
        print(f"htab_elem_update({map}, {key}, {value})")
        print(f"htab_elem_update({map}, {key}, {value}) = {htab_elem_update(map, key, value)}")

HTabUpdateTest()
