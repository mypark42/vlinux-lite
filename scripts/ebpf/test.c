#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

typedef unsigned int u32;
typedef int pid_t;
const pid_t pid_filter = 0;

char LICENSE[] SEC("license") = "Dual BSD/GPL";

#define MAX_TRACKED 64

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_TRACKED);
    __type(key, __u64);
    __type(value, __u8);
} test_hash SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, MAX_TRACKED);
    __type(key, __u32);
    __type(value, __u32);
} test_array SEC(".maps");

// Primary tracepoint - should work on most kernels
SEC("tp/syscalls/sys_enter_execve")
int handle_tp(void *ctx) {
    pid_t pid = bpf_get_current_pid_tgid() >> 32;
    if (pid_filter && pid != pid_filter)
        return 0;
    bpf_printk("BPF triggered sys_enter_execve from PID %d.\n", pid);
    // update test_array here
    static __u32 next_index = 0;
    __u32 key = next_index % MAX_TRACKED;
    bpf_map_update_elem(&test_array, &key, &pid, BPF_ANY);
    next_index ++;
    return 0;
}

// Alternative tracepoint for broader compatibility
SEC("tp/syscalls/sys_enter_write") 
int handle_write(void *ctx) {
    pid_t pid = bpf_get_current_pid_tgid() >> 32;
    if (pid_filter && pid != pid_filter)
        return 0;
    bpf_printk("BPF triggered sys_enter_write from PID %d.\n", pid);
    return 0;
}
