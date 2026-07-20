import lib.utils

define BPFMap as Box<bpf_map> [
    Text name
    Link inner_map_meta -> @inner_map_meta
    Text<enum:bpf_map_type> map_type
    Text key_size
    Text value_size
    Text max_entries
    Text<u32:b> map_flags
] where {
    inner_map_meta = BPFMap(@this.inner_map_meta)
}

define BPFArray as Box<bpf_array> [
    Shape map: @map
    Text elem_size
    Text<u32:b> index_mask
    Text<raw_ptr> value
] where {
    map = BPFMap(@this.map)
}

define BPFHTabBucket as Box<bucket> [
    Text<raw_ptr> head
]
define BPFHTabElem as Box<htab_elem> [
    Text hash
    Text<u64:x> key: @key
    Text value: @value
] where {
    key = ${htab_elem_key(@map, @this)}
    value = ${htab_elem_value(@map, @this)}
}
define BPFHashTable as Box<bpf_htab> [
    Shape map: @map
    Link elems -> @elems
    Text elem_size
    Text hashrnd
] where {
    map = BPFMap(@this.map)
    elems = Array("elems": ${htab_elems(@this)}).forEach |item| {
        yield [ Link "elem #{@index}" -> @elem ] where {
            elem = BPFHTabElem(@item)
        }
    }
}

define BPFProgAux as Box<bpf_prog_aux> [
    Text name
    Text id
    Text used_map_cnt
    Text attach_btf_trace
    Link used_maps -> @used_maps
] where {
    map_cnt = ${*@this.used_map_cnt}
    used_maps = Array("used_maps": ${cast_to_parray(@this.used_maps, bpf_map, @map_cnt)}).forEach |item| {
        yield [ Link "map #{@index}" -> @map ] where {
            map = switch ${*@item.map_type} {
                case ${BPF_MAP_TYPE_ARRAY}: BPFArray("bpf_array": @item)
                case ${BPF_MAP_TYPE_HASH}: BPFHashTable("bpf_hash": @item)
                case ${BPF_MAP_TYPE_PERF_EVENT_ARRAY}: BPFArray("bpf_perf_event_array": @item)
                otherwise: BPFMap("undefined_bpf_map": @item)
            }
        }
    }
}

define BPFProg as Box<bpf_prog> [
    Text pages
    Text<enum:bpf_prog_type> type
    Text<enum:bpf_attach_type> expected_attach_type
    Link aux -> @aux
] where {
    aux = BPFProgAux(@this.aux)
}

define PerfTpEvent as Box<perf_event> [
    Text name:  tp_event.name
    Text class: tp_event.class.system
]

define BPFLinkOps as Box<bpf_link_ops> [
    Text<fptr> release, dealloc, detach, update_prog, show_fdinfo, fill_link_info
]
define BPFLink as Box<bpf_link> [
    Text id
    Text<enum:bpf_link_type> type
    Link ops -> @ops
    Link prog -> @prog
    Text<fptr> work_func: work.func
    Link perf_event -> @perf_event
] where {
    ops = BPFLinkOps(@this.ops)
    prog = BPFProg(@this.prog)
    fucktype = @this.type
    perf_link = ${container_of(@this, struct bpf_perf_link, link)}
    perf_event = switch ${*@this.type} {
        case ${BPF_LINK_TYPE_PERF_EVENT}:
            PerfTpEvent("perf_tp_event": @perf_link.perf_file.private_data)
        otherwise:
            NULL
    }
}

define IDR_BPF_Links as Box<idr> {
    :default [
        Text idr_base
        Text idr_next
        Shape idr_rt: @idr_rt
    ]
} where {
    idr_rt = XArray(@this.idr_rt).forEach |item| {
        yield [ Link "link #{@index}" -> @link ] where {
            link = BPFLink(@item)
        }
    }
}

define IDR_BPF_Maps as Box<idr> {
    :default [
        Text idr_base
        Text idr_next
        Shape idr_rt: @idr_rt
    ]
} where {
    idr_rt = XArray(@this.idr_rt).forEach |item| {
        yield [ Link "map #{@index}" -> @map ] where {
            map = BPFMap(@item)
        }
    }
}

link_idr = IDR_BPF_Links(${&link_idr})
map_idr = IDR_BPF_Maps(${&map_idr})
diag bpf_for_vdiff {
    plot @link_idr
}
