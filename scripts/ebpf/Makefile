# clang
CLANG := clang

# bpf-specific flags
BPF_CFLAGS := -Wall -target bpf -g -O2 -D__BPF_TRACING__ -D__KERNEL__ -D__TARGET_ARCH_x86 -D__BITS_PER_LONG=64

# system include paths for standard C headers
CLANG_VERSION := $(shell clang --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | cut -d. -f1)
SYS_INC_FLAGS := -I/usr/lib/llvm-$(CLANG_VERSION)/lib/clang/*/include

# include paths for kernel headers
KERNEL_SRC := ../../kernel/
INC_FLAGS  := \
	-I$(KERNEL_SRC)/tools/lib/bpf \
	-I$(KERNEL_SRC)/tools/include \
	-I$(KERNEL_SRC)/tools/include/uapi \
	-I$(KERNEL_SRC)/include/uapi \
	-I$(KERNEL_SRC)/include \
	-I$(KERNEL_SRC)/arch/x86/include \
	-I$(KERNEL_SRC)/arch/x86/include/uapi \
	-I$(KERNEL_SRC)/arch/x86/include/generated \
	-I$(KERNEL_SRC)/include/generated/uapi \
	-I$(KERNEL_SRC)/include/generated

# rules

SOURCE := trace_alloc.c
TARGET := ebpf-vdiff.o

build: loader $(TARGET)

loader: loader.c
	$(CLANG) -o ebpf_loader loader.c -g -O2 -static -lbpf -lelf -lz

$(TARGET): $(SOURCE)
	echo "++ build ebpf:$(FILENAME)"
	$(CLANG) $(BPF_CFLAGS) $(SYS_INC_FLAGS) $(INC_FLAGS) -c $(SOURCE) -o $(TARGET)

clean:
	rm -f *.o

.PHONY: build clean
