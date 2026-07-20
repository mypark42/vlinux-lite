from visualinux import *
from visualinux.runtime.linux.mm import *

class Vma2Page(gdb.Command):
    """Show all pages of a VMA. Usage: vma2page <vma_ptr>"""

    def __init__(self):
        super(Vma2Page, self).__init__("vma2page", gdb.COMMAND_USER)

    def invoke(self, arg, from_tty):
        argv = gdb.string_to_argv(arg)
        if len(argv) != 1:
            print("Usage: vma2page <vma_addr>")
            return
        vma_addr = gdb.parse_and_eval(argv[0])
        pages = get_all_pages_in_vma(vma_addr)
        print("VMA pages:")
        for addr, page in pages:
            print("  Address 0x%x: %s" % (addr, page))

class Va2Page(gdb.Command):
    """Show all pages of a VMA. Usage: va2page <vaddr>"""

    def __init__(self):
        super(Va2Page, self).__init__("va2page", gdb.COMMAND_USER)

    def invoke(self, arg, from_tty):
        argv = gdb.string_to_argv(arg)
        if len(argv) != 1:
            print("Usage: va2page <vaddr>")
            return
        vaddr = gdb.parse_and_eval(argv[0])
        pfn = vaddr_to_pfn(vaddr)
        print(f"  pfn: {int(pfn):#x}")
        page = pfn_to_struct_page(pfn)
        print(f"  page: {int(page):#x}")
        print("  Virtual Address 0x%x: %s" % (vaddr, page))

try:
    Vma2Page()
    Va2Page()
except:
    raise fuck_exc(AssertionError, 'internal error on loading mm helper commands')
