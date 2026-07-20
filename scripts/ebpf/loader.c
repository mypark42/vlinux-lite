#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <bpf/libbpf.h>
#include <bpf/bpf.h>

#define MAX_PROBES 16
#define MAX_LINE_LEN 512
#define MAX_PATH_LEN 256

struct probe_config {
    char pin_path[MAX_PATH_LEN];
    char section_name[64];
    char probe_type[16];
    char probe_target[64];
};

static int parse_config_line(char *line, struct probe_config *config) {
    // Skip comments and empty lines
    if (line[0] == '#' || line[0] == '\n' || line[0] == '\0') {
        return 0;
    }
    // Remove trailing newline
    char *newline = strchr(line, '\n');
    if (newline) *newline = '\0';
    // Parse: pin_path section_name probe_type probe_target
    if (sscanf(line, "%255s %63s %15s %63s", 
               config->pin_path,
               config->section_name,
               config->probe_type,
               config->probe_target) == 4) {
        return 1;
    }
    return 0;
}

static int attach_probe(struct bpf_object *obj, struct probe_config *config) {
    printf("Attaching probe: %s -> %s:%s\n", 
           config->section_name, 
           config->probe_type, 
           config->probe_target);

    // Try to find program by name first, then by title for older libbpf versions
    struct bpf_program *prog = bpf_object__find_program_by_name(obj, config->section_name);
    if (!prog) {
        // Fallback to find by title for older libbpf versions
        prog = bpf_object__find_program_by_title(obj, config->section_name);
    }
    
    if (!prog) {
        fprintf(stderr, "Failed to find program with section: %s\n", config->section_name);
        // List available programs for debugging
        struct bpf_program *p;
        fprintf(stderr, "Available programs:\n");
        bpf_object__for_each_program(p, obj) {
            fprintf(stderr, "  - %s\n", bpf_program__name(p));
        }
        return -1;
    }

    struct bpf_link *link = NULL;

    if (strcmp(config->probe_type, "tracepoint") == 0) {
        // Parse tracepoint group and name from probe_target (format: group:name)
        char target_copy[64];
        strcpy(target_copy, config->probe_target);
        char *colon = strchr(target_copy, ':');
        if (!colon) {
            fprintf(stderr, "Invalid tracepoint format. Expected 'group:name', got: %s\n", config->probe_target);
            return -1;
        }
        *colon = '\0';
        char *tracepoint_group = target_copy;
        char *tracepoint_name = colon + 1;
        
        link = bpf_program__attach_tracepoint(prog, tracepoint_group, tracepoint_name);
        if (libbpf_get_error(link)) {
            fprintf(stderr, "Failed to attach to tracepoint: %s:%s\n", tracepoint_group, tracepoint_name);
            return -1;
        }
        printf("  ✓ Attached to tracepoint: %s:%s\n", tracepoint_group, tracepoint_name);
        
    } else if (strcmp(config->probe_type, "kretprobe") == 0) {
        link = bpf_program__attach_kprobe(prog, true, config->probe_target);  // true for return probe
        if (libbpf_get_error(link)) {
            fprintf(stderr, "Failed to attach to kretprobe: %s\n", config->probe_target);
            return -1;
        }
        printf("  ✓ Attached to kretprobe: %s\n", config->probe_target);
        
    } else if (strcmp(config->probe_type, "kprobe") == 0) {
        link = bpf_program__attach_kprobe(prog, false, config->probe_target);  // false for entry probe
        if (libbpf_get_error(link)) {
            fprintf(stderr, "Failed to attach to kprobe: %s\n", config->probe_target);
            return -1;
        }
        printf("  ✓ Attached to kprobe: %s\n", config->probe_target);
        
    } else {
        fprintf(stderr, "Unsupported probe type: %s. Supported types: tracepoint, kprobe, kretprobe\n", config->probe_type);
        return -1;
    }

    if (bpf_link__pin(link, config->pin_path)) {
        fprintf(stderr, "Failed to pin link at %s\n", config->pin_path);
        return -1;
    }
    printf("  ✓ Link pinned at %s\n", config->pin_path);

    return 0;
}

int main(int argc, char *argv[]) {
    if (argc < 2 || argc > 3) {
        fprintf(stderr, "Usage: %s <object_file> [config_file]\n", argv[0]);
        fprintf(stderr, "  object_file: Path to the compiled eBPF object file (e.g., /ebpf-vdiff.o)\n");
        fprintf(stderr, "  config_file: Path to configuration file (default: /config.txt)\n");
        fprintf(stderr, "\nConfig file format (one probe per line):\n");
        fprintf(stderr, "  pin_path section_name probe_type probe_target\n");
        fprintf(stderr, "\nExample config:\n");
        fprintf(stderr, "  /sys/fs/bpf/vdiff_kmalloc kretprobe/__kmalloc kretprobe __kmalloc\n");
        fprintf(stderr, "  /sys/fs/bpf/vdiff_cache kretprobe/kmem_cache_alloc kretprobe kmem_cache_alloc\n");
        return 1;
    }

    char *object_file = argv[1];
    char *config_file = argc > 2 ? argv[2] : "/config.txt";

    printf("eBPF Multi-Probe Loader\n");
    printf("========================\n");
    printf("Object file: %s\n", object_file);
    printf("Config file: %s\n", config_file);
    printf("\n");

    // Load the eBPF object file
    printf("Loading eBPF object file...\n");
    struct bpf_object *obj = bpf_object__open_file(object_file, NULL);
    if (libbpf_get_error(obj)) {
        fprintf(stderr, "Failed to open BPF object: %s\n", object_file);
        return 1;
    }

    int err = bpf_object__load(obj);
    if (err) {
        fprintf(stderr, "Failed to load BPF object: %d\n", err);
        bpf_object__close(obj);
        return 1;
    }
    printf("  ✓ eBPF object loaded successfully\n\n");

    // Read configuration file
    printf("Reading configuration from %s...\n", config_file);
    FILE *fp = fopen(config_file, "r");
    if (!fp) {
        fprintf(stderr, "Failed to open config file: %s\n", config_file);
        bpf_object__close(obj);
        return 1;
    }

    struct probe_config probes[MAX_PROBES];
    int num_probes = 0;
    char line[MAX_LINE_LEN];

    while (fgets(line, sizeof(line), fp) && num_probes < MAX_PROBES) {
        if (parse_config_line(line, &probes[num_probes])) {
            printf("  Parsed: %s -> %s:%s (pin: %s)\n", 
                   probes[num_probes].section_name,
                   probes[num_probes].probe_type,
                   probes[num_probes].probe_target,
                   probes[num_probes].pin_path);
            num_probes++;
        }
    }
    fclose(fp);

    if (num_probes == 0) {
        fprintf(stderr, "No valid probe configurations found in %s\n", config_file);
        bpf_object__close(obj);
        return 1;
    }

    printf("  ✓ Found %d probe configuration(s)\n\n", num_probes);

    // Attach all probes
    printf("Attaching probes...\n");
    int success_count = 0;
    for (int i = 0; i < num_probes; i++) {
        printf("[%d/%d] ", i + 1, num_probes);
        if (attach_probe(obj, &probes[i]) == 0) {
            success_count++;
        } else {
            fprintf(stderr, "  ✗ Failed to attach probe: %s\n", probes[i].section_name);
        }
        printf("\n");
    }

    printf("Attachment Summary:\n");
    printf("==================\n");
    printf("Successfully attached: %d/%d probes\n", success_count, num_probes);

    if (success_count == 0) {
        fprintf(stderr, "No probes were successfully attached\n");
        bpf_object__close(obj);
        return 1;
    }

    if (success_count < num_probes) {
        printf("Warning: Some probes failed to attach. Check kernel symbols and permissions.\n");
    }

    printf("\neBPF program loaded successfully with %d active probe(s)\n", success_count);
    printf("Probe links have been pinned and will remain active.\n");

    // Keep the object reference alive by not closing it immediately
    // The kernel will maintain the programs through the pinned links
    return 0;
}
