from visualinux import *
from visualinux.runtime.linux.bpf import *

class VDiffMonitor:
    def __init__(self):
        self.enabled = True
        self.bpf_map = KValue(GDBType.lookup('bpf_map'), 0)
        
        # Track snapshot keys and their relationships
        self.prev_sn_key: str | None = None
        self.current_sn_key: str | None = None
        
        # Map from (sn_key_src, sn_key_dst) to set of tracked addresses
        self.tracked_addrs_map: dict[tuple[str, str], set[int]] = {}
        
        # Current addresses being tracked (for the current sync period)
        self.current_addrs: set[int] = set()
        
        # Global set of all addresses ever tracked (for BPF map updates)
        self.all_tracked_addrs: set[int] = set()

    def begin_sync(self, sn_key: str):
        """Begin a new sync period with the given snapshot key."""
        self.prev_sn_key = self.current_sn_key
        self.current_sn_key = sn_key
        self.current_addrs.clear()

    def update(self, addrs: list[int]):
        """Update tracked addresses for the current sync period."""
        if not self.enabled or self.bpf_map.value == 0:
            return
        if self.current_sn_key is None:
            return
        
        # Add addresses to current tracking set
        for addr in addrs:
            if addr > 0:
                self.current_addrs.add(addr)

    def end_sync(self):
        """End the current sync period and commit tracked addresses."""
        if not self.enabled or self.bpf_map.value == 0:
            return
        if self.current_sn_key is None:
            return
        
        # If there's a previous snapshot, record the addresses between them
        if self.prev_sn_key is not None:
            key_pair = (self.prev_sn_key, self.current_sn_key)
            self.tracked_addrs_map[key_pair] = self.current_addrs.copy()
            
            # Update BPF map with new addresses
            value = KValue(GDBType.basic('uint8_t'), 0)
            for addr in self.current_addrs:
                if addr not in self.all_tracked_addrs:
                    self.all_tracked_addrs.add(addr)
                    key = KValue(GDBType.basic('uintptr_t'), addr)
                    htab_elem_update(self.bpf_map, key, value)
            
            print(f'vdiff_monitor: tracked {len(self.current_addrs)} addrs between {self.prev_sn_key} -> {self.current_sn_key}')
            print(f'  addrs: {[f"{addr:#x}" for addr in sorted(self.current_addrs)]}')

    def get_tracked_addrs(self, sn_key_src: str, sn_key_dst: str) -> set[int]:
        """Get tracked addresses between two snapshot keys."""
        return self.tracked_addrs_map.get((sn_key_src, sn_key_dst), set())
    
    def get_all_periods(self) -> list[tuple[str, str]]:
        """Get all recorded snapshot key pairs."""
        return list(self.tracked_addrs_map.keys())
    
    def has_period(self, sn_key_src: str, sn_key_dst: str) -> bool:
        """Check if a period between two snapshot keys exists."""
        return (sn_key_src, sn_key_dst) in self.tracked_addrs_map
