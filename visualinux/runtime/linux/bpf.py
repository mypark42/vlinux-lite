from visualinux import *
from visualinux.runtime.kvalue import *
from visualinux.runtime.linux.common import container_of
from visualinux.runtime.linux.jhash import jhash
from visualinux.runtime.linux.bpf_hack import htab_elem_create_prealloc_nolock

import gdb

def round_up(x: int, y: int) -> int:
    '''#define __round_mask(x, y) ((__typeof__(x))((y)-1))
       #define round_up(x, y) ((((x)-1) | __round_mask(x, y))+1)
    '''
    return ((x - 1) | (y - 1)) + 1

def select_bucket(htab: KValue, hash: KValue) -> KValue:
    '''&htab->buckets[hash & (htab->n_buckets - 1)]
    '''
    buckets = htab.eval_field('buckets')
    n_buckets = htab.eval_field('n_buckets').dereference().value_uint(ptr_size)
    bucket_size = GDBType.lookup('bucket').target_size()
    bucket_index = hash.value_uint(ptr_size) & (n_buckets - 1)
    bucket_addr = buckets.value_uint(ptr_size) + (bucket_index * bucket_size)
    bucket = KValue(GDBType.lookup('bucket'), bucket_addr)
    return bucket

def htab_elems(htab: KValue) -> PyListOfKValues:
    '''All active elems.
    '''
    buckets = htab.eval_field('buckets')
    n_buckets = htab.eval_field('n_buckets').dereference().value_uint(ptr_size)
    bucket_size = GDBType.lookup('bucket').target_size()

    elems: list[KValue] = []
    for i in range(n_buckets):
        bucket_addr = buckets.value_uint(ptr_size) + (i * bucket_size)
        bucket = KValue(GDBType.lookup('bucket'), bucket_addr)
        node = bucket.eval_field('head').eval_field('first')
        while not (node.value_uint(ptr_size) == 0 or node.value_uint(ptr_size) & 1):
            elem = container_of(node, 'htab_elem', 'hash_node')
            elems.append(elem)
            node = node.eval_field('next')

    map = htab.eval_field('map')
    key_size = map.eval_field('key_size').dereference().value_uint(ptr_size)
    elems.sort(key=lambda elem: htab_elem_key(map, elem).dereference().value_uint(key_size * 8))
    return PyListOfKValues(elems)

def htab_elems_all(htab: KValue) -> PyListOfKValues:
    '''All elems including the recycled ones.
    '''
    map = htab.eval_field('map')
    max_entries = map.eval_field('max_entries').dereference().value_uint(ptr_size)
    elems_head = htab.eval_field('elems')
    elem_size = htab.eval_field('elem_size').dereference().value_uint(ptr_size)
    elems: list[KValue] = []
    for i in reversed(range(max_entries)):
        p = elems_head.value_uint(ptr_size) + i * elem_size
        elem = (KValue(GDBType.lookup('htab_elem'), p))
        hash = elem.eval_field('hash').dereference().value_uint(ptr_size)
        if hash != 0:
            elems.append(elem)

    return PyListOfKValues(elems)

def __htab_elem_key(elem: KValue, key_size: int) -> KValue:
    key = KValue(GDBType.basic(f'int{key_size * 8}_t').pointer(), elem.eval_field('key').value_uint(ptr_size))
    return key

def htab_elem_key(map: KValue, elem: KValue) -> KValue:
    key_size = map.eval_field('key_size').dereference().value_uint(ptr_size)
    return __htab_elem_key(elem, key_size)

def htab_elem_value(map: KValue, elem: KValue) -> KValue:
    key_size = map.eval_field('key_size').dereference().value_uint(ptr_size)
    value_size = map.eval_field('value_size').dereference().value_uint(ptr_size)
    key = elem.eval_field('key').value_uint(ptr_size)
    value = KValue(GDBType.basic(f'int{value_size * 8}_t').pointer(), key + round_up(key_size, 8))
    return value

def htab_map_hash(key: KValue, key_len: KValue, hashrnd: KValue) -> KValue:
    hsh = jhash(key.value_uint(ptr_size), key_len.value_uint(ptr_size), hashrnd.value_uint(ptr_size))
    return KValue(GDBType.basic(f'int{ptr_size}_t'), hsh)

def htab_elem_lookup_raw(head: KValue, v_hash: KValue, v_key: KValue, v_key_size: KValue) -> KValue:
    '''
    hlist_nulls_for_each_entry_rcu(l, n, head, hash_node)
        if (l->hash == hash && !memcmp(&l->key, key, key_size))
        return l;
    '''
    hash = v_hash.value_uint(ptr_size)
    key_size = v_key_size.value_uint(ptr_size)
    key = v_key.value_uint(key_size * 8)

    node = head.eval_field('first')
    while not (node.value_uint(ptr_size) == 0 or node.value_uint(ptr_size) & 1):
        elem = container_of(node, 'htab_elem', 'hash_node')
        elem_hash = elem.eval_field('hash').dereference().value_uint(ptr_size)
        elem_key = __htab_elem_key(elem, key_size).dereference().value_uint(key_size * 8)
        if elem_hash == hash and elem_key == key:
            return elem
        node = node.eval_field('next')

    # return NULL equivalent
    return KValue(GDBType.lookup('htab_elem').pointer(), 0)

def htab_elem_update(map: KValue, key: KValue, value: KValue) -> None:
    htab = container_of(map, 'bpf_htab', 'map')
    key_size = map.eval_field('key_size').dereference()
    hash = htab_map_hash(key, key_size, htab.eval_field('hashrnd').dereference())

    bucket = select_bucket(htab, hash)
    head = bucket.eval_field('head')

    elem = htab_elem_lookup_raw(head, hash, key, key_size)
    if elem.value == 0:
        elem = htab_elem_create_prealloc_nolock(htab, bucket, hash, key, key_size)
        if elem.value == 0:
            return

    elem_value = htab_elem_value(map, elem)
    gdb.parse_and_eval(f'*{elem_value} = {value}') # type: ignore
