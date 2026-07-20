define Page as Box<page> [
    Text<raw_ptr> phys_addr: @this
    Text<flag:page> flags
    Text refcount: _refcount.counter
]

//// io_uring ////

define IOUringBufRing as Box<io_uring_buf_ring> [
    Text<raw_ptr> bufs
    Link phys_page -> @page
] where {
    page = Page(${virt_to_page(@this.bufs)})
}

define IOBufferList as Box<io_buffer_list> [
    Text bgid
    Link buf_ring -> @buf_ring
    Text is_mapped, is_mmap
] where {
    buf_ring = IOUringBufRing(@this.buf_ring)
}

define IORingCtx as Box<io_ring_ctx> [
    Text submit_pid: submitter_task.pid
    Link io_bls -> @io_bls
    // Link io_bl_pages -> @io_bl_pages
] where {
    // io_bl = IOBufferList(@this.io_bl)
    io_bls = Array(bls: ${cast_to_array(@this.io_bl, io_buffer_list, BGID_ARRAY)}).forEach |item| {
        member = switch @item {
            case ${NULL}:
                NULL
            otherwise:
                [ Link "bl #{@index}" -> @bl ] where {
                    bl = IOBufferList(@item)
                }
        }
        yield @member
    }
    // io_bl_pages = Array.convFrom(@io_bls, page)
}

define IOTCtxNode as Box<io_tctx_node> [
    Text task_pid: task.pid
    Link ctx -> @ctx
] where {
    ctx = IORingCtx(io_ring_ctx: @this.ctx)
}

//// pipe ////

define PipeBuffer as Box<pipe_buffer> [
    Link page -> @page
    Text offset, len
    Text<flag:pipe_buffer> flags
] where {
    page = Page(@this.page)
}

define PipeINodeInfo as Box<pipe_inode_info> [
    Text head, tail
    Text max_usage, ring_size, nr_accounted
	Text readers, writers
    Text files
	Text r_counter, w_counter
    Link bufs -> @bufs
] where {
    bufs = Array("pipe_bufs": ${cast_to_array(@this.bufs, "pipe_buffer", @this.ring_size)}).forEach |item| {
        yield [ Link "pipe_buf #{@index}" -> @pipe_buf ] where {
            pipe_buf = PipeBuffer(@item)
        }
    }
}

//// addrspace ////

define VMArea as Box<vm_area_struct> [
    Text<u64:x> vm_start, vm_end
    Text<flag:vm_basic> vm_flags
    Text<bool> is_writable: ${vma_is_writable(@this)}
    Link pages -> @pages
] where {
    pages = Array(phys_pages: ${get_pages_in_vma(@this)}).forEach |item| {
        yield [ Link "page #{@index}" -> @page ] where {
            page = Page(@item)
        }
    }
}

define MapleNode as Box<maple_node> [
    Text<enum:maple_type> type: @type
    Text<u64:x> min: @ma_min
    Text<u64:x> max: @ma_max
    Shape slots: @slots
    Shape pivots: @pivots
] where {
    is_leaf = ${mte_is_leaf(@this)}
    node = ${mte_to_node(@this)}
    type = ${mte_node_type(@this)}
    last_ma_min = @ma_min
    last_ma_max = @ma_max
    slots = switch @type {
    case ${maple_dense}:
        Array(slots: @node.slot).forEach |item| {
            ma_min = ${@last_ma_min + @index}
            ma_max = @ma_min
            yield [ Link "slot #{@index}" -> @slot ] where {
                slot = VMArea("vm_area_struct #{@index}": @item)
            }
        }
    case ${maple_leaf_64}, ${maple_range_64}:
        Array(slots: @node.mr64.slot).forEach |item| {
            pivots = @node.mr64.pivot
            yield [ Link "slot #{@index}" -> @slot_safe ] where {
                slot_entry = @item
                ma_min = ${ma_calc_min(@pivots, @index, @last_ma_min)}
                ma_max = ${ma_calc_max(@pivots, @index, @last_ma_max)}
                slot_is_safe = ${mt_slot_is_safe(@pivots, @index, @last_ma_max)}
                slot_safe = switch @slot_is_safe {
                case ${true}:
                    switch @is_leaf {
                        case ${true}:  VMArea("vm_area_struct #{@index}": @slot_entry)
                        case ${false}: MapleNode(maple_node: @slot_entry)
                    }
                case ${false}:
                    NULL
                }
            }
        }
    case ${maple_arange_64}:
        Array(slots: @node.ma64.slot).forEach |item| {
            pivots = @node.ma64.pivot
            yield [ Link "slot #{@index}" -> @slot_safe ] where {
                slot_entry = @item
                ma_min = ${ma_calc_min(@pivots, @index, @last_ma_min)}
                ma_max = ${ma_calc_max(@pivots, @index, @last_ma_max)}
                slot_is_safe = ${mt_slot_is_safe(@pivots, @index, @last_ma_max)}
                slot_safe = switch @slot_is_safe {
                case ${true}:
                    switch @is_leaf {
                        case ${true}:  VMArea("vm_area_struct #{@index}": @slot_entry)
                        case ${false}: MapleNode(maple_node: @slot_entry)
                    }
                case ${false}:
                    NULL
                }
            }
        }
    otherwise:
        VBox(slots) [ Text unkown_type: @type ]
    }
    pivots = switch @type {
    case ${maple_dense}: NULL
    case ${maple_leaf_64}, ${maple_range_64}:
        Array(pivots: @node.mr64.pivot).forEach |item| {
            yield [ Text<u64:x> "pivot #{@index}": @item ]
        }
    case ${maple_arange_64}:
        Array(pivots: @node.ma64.pivot).forEach |item| {
            yield [ Text<u64:x> "pivot #{@index}": @item ]
        }
    }
}

define MapleTree as Box<maple_tree> [
    Text<emoji:lock> ma_lock: ma_lock.rlock.raw_lock.locked
    Link ma_root -> @ma_root
    Text<flag:maple_tree> ma_flags
    Text height: ${mt_height(@this)}
    Text<bool> in_rcu: ${mt_in_rcu(@this)}
    Text<bool> ext_lk: ${mt_external_lock(@this)}
] where {
    ma_root_entry = @this.ma_root
    type = ${mte_node_type(@ma_root_entry)}
    ma_min = ${0}
    ma_max = ${mt_node_max(@ma_root_entry)}
    ma_root = switch ${xa_is_node(@ma_root_entry)} {
    case ${true}:
        MapleNode(maple_root: @this.ma_root)
    case ${false}:
        VBox(maple_root) [ Text ma_root: @ma_root_entry ]
    }
}

define MMStruct as Box<mm_struct> [
    Text<u64:x> mmap_base
    Text mm_count: mm_count.counter
    Text map_count
    Link addrspace -> @mm_as
] where {
    mm_mt = MapleTree(@this.mm_mt)
    mm_as = Array.convFrom(@mm_mt, vm_area_struct)
}

//// task ////

define File as Box<file> [
    Text<string> filename: f_path.dentry.d_name.name
	Text<flag:fcntl> f_flags
	Text<raw_ptr> f_op
    Text<raw_ptr> private_data
    Shape private_obj: @priv_node
] where {
    i_mode = @this.f_inode.i_mode
    priv_data = @this.private_data
    priv_node = switch ${true} {
        case ${S_ISFIFO(@i_mode)}:
            [ Link pipe_info -> @pipe_info ] where {
                pipe_info = PipeINodeInfo("pipe_info": @priv_data)
            }
        case ${@this.f_op == &io_uring_fops}:
            [ Link io_uring -> @ctx ] where {
                ctx = IORingCtx("io_uring_ctx": @priv_data)
            }
        otherwise:
            [ Text<raw_ptr> ptr: @priv_data ]
    }
}

define TaskStruct as Box<task_struct> [
    Text pid, comm
    Link io_uring_xa -> @xa
    Link open_fds -> @fds
    Link mm -> @mm
] where {
    xa = switch @this.io_uring {
        case ${NULL}:
            NULL
        otherwise:
            XArray(@this.io_uring.xa).forEach |item| {
                yield [ Link tctx -> @tctx ] where {
                    tctx = IOTCtxNode(@item)
                }
            }
    }
    fds = Array(fds: ${cast_to_parray(@this.files.fdt.fd, file, NR_OPEN_DEFAULT)}).forEach |item| {
        member = switch @item {
            case ${NULL}:
                NULL
            otherwise:
                [ Link "file #{@index}" -> @file ] where {
                    file = File(@item)
                }
        }
        yield @member
    }
    mm = MMStruct(@this.mm)
}

diag io_uring {
    plot TaskStruct("task_current": ${per_cpu_current_task(current_cpu())})
} with {
    unrelated_bls = SELECT io_buffer_list
        FROM *
        WHERE is_mapped == 0 OR is_mmap == 0
    UPDATE unrelated_bls WITH trimmed: true

    io_uring_bls = SELECT io_ring_ctx->io_bls FROM *
    io_uring_pgs = SELECT page FROM REACHABLE(io_uring_bls)

    vma_ptr_pgs = SELECT vm_area_struct->pages FROM *
    vma_pgs = SELECT page FROM REACHABLE(vma_ptr_pgs)

    UPDATE vma_pgs \ io_uring_pgs WITH trimmed: true
    UPDATE io_uring_pgs \ vma_pgs WITH trimmed: true

    UPDATE io_uring_bls WITH collapsed: true
    UPDATE vma_ptr_pgs WITH collapsed: true

    low_vmas = SELECT vm_area_struct
        FROM *
        WHERE vm_start < 0x10000000
    UPDATE low_vmas WITH trimmed: true
}
