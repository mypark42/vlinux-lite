from visualinux import *
from visualinux.runtime.kvalue import *

# This script is not generic and only supports normal pages under x86_64/SPARSEMEM

def phys2virt(phys: int) -> int:
    '''phys + PAGE_OFFSET
    '''
    PAGE_OFFSET = int(gdb_adaptor.eval('page_offset_base'))
    return (phys + PAGE_OFFSET)

def virt2pfn(virt: int) -> int:
    PAGE_OFFSET = int(gdb_adaptor.eval('page_offset_base'))
    PAGE_SHIFT = int(gdb_adaptor.eval('PAGE_SHIFT'))
    return (virt - PAGE_OFFSET) >> PAGE_SHIFT

def pfn2page(pfn: int) -> int:
    vmemmap_base = int(gdb_adaptor.eval('vmemmap_base'))
    return vmemmap_base + pfn * GDBType.lookup('page').target_size()

def uvirt2pfn(uvirt: int, pgd: int) -> int:
    gtype_ptr_u64 = GDBType.basic('uint64_t').pointer()
    # uvirt => pgd
    pgd_idx = (uvirt >> 39) & 0x1ff
    pud_idx = (uvirt >> 30) & 0x1ff
    pmd_idx = (uvirt >> 21) & 0x1ff
    pte_idx = (uvirt >> 12) & 0x1ff
    pgd_entry = KValue(gtype_ptr_u64, pgd + pgd_idx * gtype_ptr_u64.sizeof()).dereference().value
    if not (pgd_entry & 1): return -1
    # pgd => pud
    pud_base = pgd_entry & ~0xfff
    pud = phys2virt(pud_base)
    pud_entry = KValue(gtype_ptr_u64, pud + pud_idx * gtype_ptr_u64.sizeof()).dereference().value
    if not (pud_entry & 1): return -1
    # pud => pmd
    pmd_base = pud_entry & ~0xfff
    pmd = phys2virt(pmd_base)
    pmd_entry = KValue(gtype_ptr_u64, pmd + pmd_idx * gtype_ptr_u64.sizeof()).dereference().value
    if not (pmd_entry & 1): return -1
    # pmd => pte
    pte_base = pmd_entry & ~0xfff
    pte = phys2virt(pte_base)
    pte_entry = KValue(gtype_ptr_u64, pte + pte_idx * gtype_ptr_u64.sizeof()).dereference().value
    if not (pte_entry & 1): return -1
    # pte => pfn
    pfn = (int(pte_entry) >> 12) & ((1 << 40) - 1)
    return pfn

def virt_to_page(virt: KValue) -> KValue:
    addr = pfn2page(virt2pfn(virt.value_uint(ptr_size)))
    return KValue(GDBType.lookup('page'), addr)

def pfn_to_page(pfn: KValue) -> KValue:
    addr = pfn2page(pfn.value_uint(ptr_size))
    return KValue(GDBType.lookup('page'), addr)

def get_pages_in_vma(vma: KValue) -> PyListOfKValues:
    vm_start = vma.eval_field('vm_start').dereference().value_uint(ptr_size)
    vm_end   = vma.eval_field('vm_end').dereference().value_uint(ptr_size)
    mm = vma.eval_field('vm_mm')
    pgd = mm.eval_field('pgd').value_uint(ptr_size)

    pages: list[KValue] = []
    uvirt = vm_start
    while uvirt < vm_end:
        try:
            pfn = uvirt2pfn(uvirt, pgd)
            if pfn < 0:
                uvirt = (uvirt + 0x1000) & ~0xfff
                continue
            page = pfn2page(pfn)
            pages.append(KValue(GDBType.lookup('page'), page))
            uvirt += 0x1000
        except Exception as e:
            print(f"  error in uvirt2phys({uvirt:#x}, {pgd=:#x}): {e}")
            uvirt = (uvirt + 0x1000) & ~0xfff

    return PyListOfKValues(pages)

def get_all_pages_in_vma(vma_addr: int):
    """Get all struct pages for a given VMA.
       An ad-hoc version of get_pages_in_vma for differential testing.
    """
    print(f'--get_all_pages_in_vma {vma_addr=:#x}')
    PAGE_OFFSET  = int(gdb_adaptor.eval('page_offset_base'))
    PAGE_SHIFT   = int(gdb_adaptor.eval('PAGE_SHIFT'))
    vmemmap_base = int(gdb_adaptor.eval('vmemmap_base'))
    u64_type   = gdb.lookup_type('uint64_t')
    vma_type   = gdb.lookup_type('struct vm_area_struct')
    page_type  = gdb.lookup_type('struct page')
    def phys_to_virt(phys):
        return phys + PAGE_OFFSET
    def pfn_to_struct_page(pfn):
        struct_page_size = page_type.sizeof
        page_addr = vmemmap_base + pfn * struct_page_size
        struct_page = gdb.Value(page_addr).cast(page_type.pointer())
        return struct_page
    pages = []
    vma = gdb.Value(vma_addr).cast(vma_type.pointer()).dereference()
    vm_start = int(vma['vm_start'])
    vm_end = int(vma['vm_end'])
    mm = vma['vm_mm']
    pgd = mm['pgd']
    print(f"  vma: {vm_start:#x} - {vm_end:#x}")
    print(f"  pgd: {int(pgd):#x}")

    addr = vm_start
    while addr < vm_end:
        print(f"  try addr: {addr:#x}")
        try:
            # Calculate indices for each level
            pgd_idx = (addr >> 39) & 0x1ff
            pud_idx = (addr >> 30) & 0x1ff
            pmd_idx = (addr >> 21) & 0x1ff
            pte_idx = (addr >> 12) & 0x1ff
            print(f"  pgd_idx: {pgd_idx:#x}, pud_idx: {pud_idx:#x}, pmd_idx: {pmd_idx:#x}, pte_idx: {pte_idx:#x}")
            # Walk the page tables
            print(f"  {pgd = !s} | {pgd + pgd_idx = !s}")
            pgd_entry = (pgd + pgd_idx).cast(u64_type.pointer()).dereference()
            print(f"  pgd_entry: {int(pgd_entry):#x}")
            if not (int(pgd_entry) & 1):
                # Skip to next page boundary
                addr = (addr + 0x1000) & ~0xfff
                continue
            pud_base = int(pgd_entry) & ~0xfff
            pud_entry = (gdb.Value(phys_to_virt(pud_base)).cast(u64_type.pointer()) + pud_idx).dereference()
            print(f"  {phys_to_virt(pud_base) = !s}")
            print(f"  {gdb.Value(phys_to_virt(pud_base)).cast(u64_type.pointer()) + pud_idx = !s}")
            print(f"  pud_entry: {int(pud_entry):#x}")
            if not (int(pud_entry) & 1):
                # Skip to next page boundary
                addr = (addr + 0x1000) & ~0xfff
                continue
            pmd_base = int(pud_entry) & ~0xfff
            pmd_entry = (gdb.Value(phys_to_virt(pmd_base)).cast(u64_type.pointer()) + pmd_idx).dereference()
            print(f"  pmd_entry: {int(pmd_entry):#x}")
            if not (int(pmd_entry) & 1):
                # Skip to next page boundary
                addr = (addr + 0x1000) & ~0xfff
                continue
            pte_base = int(pmd_entry) & ~0xfff
            print(f"  pte_base: {pte_base:#x}")
            print(f"  phys_to_virt(pte_base): {phys_to_virt(pte_base):#x}")
            pte_entry = (gdb.Value(phys_to_virt(pte_base)).cast(u64_type.pointer()) + pte_idx).dereference()
            print(f"  pte_entry: {int(pte_entry):#x}")
            if not (int(pte_entry) & 1):
                # Skip to next page boundary
                addr = (addr + 0x1000) & ~0xfff
                continue

            pfn = (int(pte_entry) >> 12)
            print(f"  pfn: {pfn:#x}")
            pfn &= ((1 << 40) - 1)
            print(f"  pfn^&: {pfn:#x}")
            page = pfn_to_struct_page(pfn)
            print(f"  page: {page}")
            pages.append((addr, page))

        except Exception as e:
            print(f"  error: {e}")
            addr = (addr + 0x1000) & ~0xfff
            continue

        addr += 0x1000
    
    return pages
