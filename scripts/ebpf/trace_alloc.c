#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

struct pt_regs {
    __u64 r15, r14, r13, r12, bp, bx, r11, r10, r9, r8;
    __u64 ax, cx, dx, si, di, orig_ax, ip, cs, flags, sp, ss;
};

#define MAX_TRACKED 1024

/* Tracked addresses storage */
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_TRACKED);
    __type(key, __u64);
    __type(value, __u8);
} vdiff_tracked SEC(".maps");

static void __track_alloc(__u64 addr, void *ctx) {
    __u8 *tracked = bpf_map_lookup_elem(&vdiff_tracked, &addr);
    __u8 value = 1;
    if (tracked != NULL) {
        bpf_printk("BPF track_alloc tracked addr=0x%llx tv=%d", addr, *tracked);
        if (bpf_map_update_elem(&vdiff_tracked, &addr, &value, BPF_ANY) != 0) {
            bpf_printk("BPF track_alloc tracked update failed");
            return;
        }
    }
}

/* Common event handler for kmalloc */
static __always_inline void log_kmalloc_event(__u64 addr, void *ctx) {
    __track_alloc(addr, ctx);
}

/* Common event handler for cache alloc */
static __always_inline void log_cache_alloc_event(__u64 addr, void *ctx) {
    __track_alloc(addr, ctx);
}

SEC("kretprobe/__kmalloc")
int vdiff_monitor(struct pt_regs *ctx) {
    __u64 addr = (__u64)PT_REGS_RC(ctx);
    log_kmalloc_event(addr, ctx);
    return 0;
}

SEC("kretprobe/kmem_cache_alloc")
int vdiff_monitor_2(struct pt_regs *ctx) {
    __u64 addr = (__u64)PT_REGS_RC(ctx);
    log_cache_alloc_event(addr, ctx);
    return 0;
}

char _license[] SEC("license") = "GPL";
