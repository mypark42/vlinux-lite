shell echo "+ source macros/flags/page.gdb"

macro define PG_locked          0x0000000000000001
macro define PG_writeback       0x0000000000000002
macro define PG_referenced      0x0000000000000004
macro define PG_uptodate        0x0000000000000008
macro define PG_dirty           0x0000000000000010
macro define PG_lru             0x0000000000000020
macro define PG_head            0x0000000000000040
macro define PG_waiters         0x0000000000000080
macro define PG_active          0x0000000000000100
macro define PG_workingset      0x0000000000000200
macro define PG_error           0x0000000000000400
macro define PG_slab            0x0000000000000800
macro define PG_owner_priv_1    0x0000000000001000
macro define PG_arch_1          0x0000000000002000
macro define PG_reserved        0x0000000000004000
macro define PG_private         0x0000000000008000
macro define PG_private_2       0x0000000000010000
macro define PG_mappedtodisk    0x0000000000020000
macro define PG_reclaim         0x0000000000040000
macro define PG_swapbacked      0x0000000000080000
macro define PG_unevictable     0x0000000000100000

macro define PM_SOFT_DIRTY      0x0080000000000000
macro define PM_MMAP_EXCLUSIVE  0x0100000000000000
macro define PM_UFFD_WP         0x0200000000000000
macro define PM_FILE            0x2000000000000000
macro define PM_SWAP            0x4000000000000000
macro define PM_PRESENT         0x8000000000000000
