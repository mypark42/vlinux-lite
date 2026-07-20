from visualinux import *
from visualinux.runtime.kvalue import *
from visualinux.runtime.linux.common import container_of, per_cpu_ptr

import gdb
import linux.cpus

def htab_elem_create_prealloc_nolock(htab: KValue, bucket: KValue, v_hash: KValue, v_key: KValue, v_key_size: KValue) -> KValue:
    hash = v_hash.value_uint(ptr_size)
    key_size = v_key_size.value_uint(ptr_size)
    key = v_key.value_uint(key_size * 8)
    gdb_adaptor.disable_cache()
    node = __pcpu_freelist_pop_nolock(htab.eval_field('freelist'))
    if node.value == 0:
        return KValue(GDBType.lookup('htab_elem').pointer(), 0)
    elem = container_of(node, 'htab_elem', 'fnode')
    gdb.parse_and_eval(f'{elem}->hash = {hash}') # type: ignore
    gdb.parse_and_eval(f'*(uint{key_size * 8}_t*)({elem}->key) = {key}') # type: ignore
    __hlist_nulls_add_head_nolock(elem.eval_field('hash_node'), bucket.eval_field('head'))
    gdb_adaptor.enable_cache()
    return elem

def __pcpu_freelist_pop_nolock(freelist: KValue) -> KValue:
    '''
    for_each_cpu_wrap(cpu, cpu_possible_mask, raw_smp_processor_id()) {
		head = per_cpu_ptr(s->freelist, cpu);
		if (!READ_ONCE(head->first))
			continue;
		raw_spin_lock(&head->lock);
		node = head->first;
		if (node) {
			WRITE_ONCE(head->first, node->next);
			raw_spin_unlock(&head->lock);
			return node;
		}
		raw_spin_unlock(&head->lock);
	}
    '''
    current_cpu = linux.cpus.get_current_cpu()
    for cpu in __for_each_possible_cpu(start_cpu=current_cpu):
        head = per_cpu_ptr(freelist.eval_field('freelist'), cpu)
        node = head.eval_field('first')
        if node.value_uint(ptr_size) != 0:
            next_node = node.eval_field('next')
            gdb.parse_and_eval(f'{head}->first = {next_node}') # type: ignore
            return node

    # per cpu lists are all empty, try extralist
    extralist = freelist.eval_field('extralist')
    node = extralist.eval_field('first')
    if node.value_uint(ptr_size) != 0:
        next_node = node.eval_field('next')
        gdb.parse_and_eval(f'{extralist}->first = {next_node}') # type: ignore
        return node

    # return NULL equivalent
    return KValue(GDBType.lookup('pcpu_freelist_node').pointer(), 0)

def __hlist_nulls_add_head_nolock(new_node: KValue, head: KValue) -> None:
    '''
    void hlist_nulls_add_head_rcu(struct hlist_nulls_node *n, struct hlist_nulls_head *h) {
        struct hlist_nulls_node *first = h->first;
        n->next = first;
        WRITE_ONCE(n->pprev, &h->first);
        rcu_assign_pointer(hlist_nulls_first_rcu(h), n);
        if (!is_a_nulls(first))
            WRITE_ONCE(first->pprev, &n->next);
    }
    '''
    first = head.eval_field('first')
    gdb.parse_and_eval(f'{new_node}->next = {first}') # type: ignore
    head_first_addr = head.address
    gdb.parse_and_eval(f'{new_node}->pprev = (struct hlist_nulls_node **)({head_first_addr:#x})') # type: ignore
    gdb.parse_and_eval(f'{head}->first = {new_node}') # type: ignore
    first_addr = first.value_uint(ptr_size)
    if first_addr != 0 and (first_addr & 1) == 0:
        new_node_next_addr = new_node.address + 0
        gdb.parse_and_eval(f'{first}->pprev = (struct hlist_nulls_node **)({new_node_next_addr:#x})') # type: ignore

def __for_each_possible_cpu(start_cpu: int) -> Generator[int, None, None]:
    '''
    #define for_each_cpu_wrap(cpu, mask, start)
	    for_each_set_bit_wrap(cpu, cpumask_bits(mask), nr_cpumask_bits, start)
    '''
    possible_cpus = list(linux.cpus.each_possible_cpu())
    if not possible_cpus:
        return
    # find the index of start_cpu in possible_cpus
    try:
        start_idx = possible_cpus.index(start_cpu)
    except ValueError:
        start_idx = 0
    # iterate over possible_cpus starting from start_idx
    for i in range(len(possible_cpus)):
        yield possible_cpus[(start_idx + i) % len(possible_cpus)]
