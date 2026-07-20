#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

struct pt_regs {
    __u64 r15, r14, r13, r12, bp, bx, r11, r10, r9, r8;
    __u64 ax, cx, dx, si, di, orig_ax, ip, cs, flags, sp, ss;
};

#define MAX_TRACKED 1024

enum event_type {
    ALLOC,
    FREE
};

/* Tracked addresses storage */
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_TRACKED);
    __type(key, __u64);
    __type(value, __u8);
} tracked_addrs SEC(".maps");

/* Per-CPU perf event array for zero contention */
struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(__u32));
    __uint(value_size, sizeof(__u32));
} alloc_events SEC(".maps");

/* Pre-defined tracked addresses in .rodata section */
static const __u64 initial_addrs[10] = {
    0xabc193ca,
    0xdeadbeef,
    0x12345678,
    0xfeedface,
    0x0badc0de,
    0x1337cafe,
    0x42f00baa,
    0x7f7f7f7f,
    0x11223344,
    0x55667788
};

/* Check if address is tracked */
static __always_inline bool addr_tracked(__u64 addr) {
    __u8 *tracked = bpf_map_lookup_elem(&tracked_addrs, &addr);
    return tracked != NULL;
}

/* Initialize tracked addresses - called from userspace or first probe */
static __always_inline void init_tracked_addrs_if_needed(void) {
    // ALL VARIABLE DECLARATIONS MUST BE AT THE TOP
    __u8 value = 1;
    __u8 value_x = 15;
    __u8 *read_val = NULL;
    int ret;

    // Use a different approach: try to insert with BPF_NOEXIST
    // If it succeeds (ret == 0), we need to initialize the rest
    // If it fails (ret != 0), already initialized
    bpf_printk("BPF init_tracked_addrs_if_needed");
    bpf_printk("BPF updating addr #0: %llx", initial_addrs[0]);
    ret = bpf_map_update_elem(&tracked_addrs, &initial_addrs[0], &value, BPF_NOEXIST);

    if (ret == 0) {
        // Successfully inserted, so we need to initialize the rest
        bpf_printk("BPF first time init - continuing");
        
        // bpf_printk("BPF updating addr #0 x: %llx", initial_addrs[0]);
        // bpf_map_update_elem(&tracked_addrs, &initial_addrs[0], &value_x, BPF_ANY);
        bpf_printk("BPF updating addr #1: %llx", initial_addrs[1]); value ++;
        bpf_map_update_elem(&tracked_addrs, &initial_addrs[1], &value, BPF_ANY);
        bpf_printk("BPF updating addr #2: %llx", initial_addrs[2]); value ++;
        bpf_map_update_elem(&tracked_addrs, &initial_addrs[2], &value, BPF_ANY);
        bpf_printk("BPF updating addr #3: %llx", initial_addrs[3]); value ++;
        bpf_map_update_elem(&tracked_addrs, &initial_addrs[3], &value, BPF_ANY);
        bpf_printk("BPF updating addr #4: %llx", initial_addrs[4]); value ++;
        bpf_map_update_elem(&tracked_addrs, &initial_addrs[4], &value, BPF_ANY);

        bpf_map_delete_elem(&tracked_addrs, &initial_addrs[2]);

        // Verify readback
        read_val = bpf_map_lookup_elem(&tracked_addrs, &initial_addrs[0]);
        if (read_val) bpf_printk("BPF readback addr #0: %llx val=%d", initial_addrs[0], *read_val);
        read_val = bpf_map_lookup_elem(&tracked_addrs, &initial_addrs[1]);
        if (read_val) bpf_printk("BPF readback addr #1: %llx val=%d", initial_addrs[1], *read_val);
        read_val = bpf_map_lookup_elem(&tracked_addrs, &initial_addrs[2]);
        if (read_val) bpf_printk("BPF readback addr #2: %llx val=%d", initial_addrs[2], *read_val);
        read_val = bpf_map_lookup_elem(&tracked_addrs, &initial_addrs[3]);
        if (read_val) bpf_printk("BPF readback addr #3: %llx val=%d", initial_addrs[3], *read_val);
        read_val = bpf_map_lookup_elem(&tracked_addrs, &initial_addrs[4]);
        if (read_val) bpf_printk("BPF readback addr #4: %llx val=%d", initial_addrs[4], *read_val);
    } else {
        // Key already exists, already initialized
        bpf_printk("BPF already initialized - skipping");
    }
}

/* Common event handler for kmalloc */
static __always_inline void log_kmalloc_event(__u64 addr, void *ctx) {
    init_tracked_addrs_if_needed();
    if (!addr_tracked(addr)) return;
    // Use a simple format string to avoid .rodata.str1.1 issues
    bpf_printk("BPF kmalloc tracked addr=0x%llx", addr);
    bpf_perf_event_output(ctx, &alloc_events, BPF_F_CURRENT_CPU, &addr, sizeof(addr));
}

/* Common event handler for cache alloc */
static __always_inline void log_cache_alloc_event(__u64 addr, void *ctx) {
    init_tracked_addrs_if_needed();
    if (!addr_tracked(addr)) return;
    bpf_printk("BPF cache_alloc tracked addr=0x%llx", addr);
    bpf_perf_event_output(ctx, &alloc_events, BPF_F_CURRENT_CPU, &addr, sizeof(addr));
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
