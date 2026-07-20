from visualinux import *
from visualinux.runtime.kvalue import *

JHASH_INITVAL = 0xdeadbeef

def jhash(key: int, length: int, initval: int) -> int:
    return jhash_8(key, length, initval)

def jhash_8(key: int, length: int, initval: int) -> int:
    if length > 8:
        return -1
    a = b = c = (JHASH_INITVAL + length + initval) % (1 << 32)
    k = key

    # while length > 12:
    #     a += get_unaligned_cpu32(key)
    #     b += get_unaligned_cpu32(key + 4 * 8)
    #     c += get_unaligned_cpu32(key + 8 * 8)
    #     a, b, c = __jhash_mix(a, b, c)
    #     length -= 12
    #     k += 12 * 8

    # if length <= 12:
    #     c += __k_cut(k, 11) << 24
    # if length >= 11:
    #     c += __k_cut(k, 10) << 16
    # if length >= 10:
    #     c += __k_cut(k, 9) << 8
    # if length >= 9:
    #     c += __k_cut(k, 8)
    if length >= 8:
        b += __k_cut(k, 7) << 24
    if length >= 7:
        b += __k_cut(k, 6) << 16
    if length >= 6:
        b += __k_cut(k, 5) << 8
    if length >= 5:
        b += __k_cut(k, 4)
    if length >= 4:
        a += __k_cut(k, 3) << 24
    if length >= 3:
        a += __k_cut(k, 2) << 16
    if length >= 2:
        a += __k_cut(k, 1) << 8
    if length >= 1:
        a += __k_cut(k, 0)
        a = (a + (1 << 32)) % (1 << 32)
        b = (b + (1 << 32)) % (1 << 32)
        c = (c + (1 << 32)) % (1 << 32)
        #  __jhash_final(a, b, c);
        c ^= b
        c -= rol32(b, 14)
        c = (c + (1 << 32)) % (1 << 32)
        a ^= c
        a -= rol32(c, 11)
        a = (a + (1 << 32)) % (1 << 32)
        b ^= a
        b -= rol32(a, 25)
        b = (b + (1 << 32)) % (1 << 32)
        c ^= b
        c -= rol32(b, 16)
        c = (c + (1 << 32)) % (1 << 32)
        a ^= c
        a -= rol32(c, 4)
        a = (a + (1 << 32)) % (1 << 32)
        b ^= a
        b -= rol32(a, 14)
        b = (b + (1 << 32)) % (1 << 32)
        c ^= b
        c -= rol32(b, 24)
        c = (c + (1 << 32)) % (1 << 32)
        # end __jhash_final

    return c

def rol32(word: int, shift: int) -> int:
    '''return (word << (shift & 31)) | (word >> ((-shift) & 31))
    '''
    a = (word << (shift & 31))
    b = (word >> ((-shift) & 31))
    a = (a + (1 << 32)) % (1 << 32)
    b = (b + (1 << 32)) % (1 << 32)
    return (a | b) % (1 << 32)

def get_unaligned_cpu32(p: int) -> int:
    '''const struct __una_u32 *ptr = (const struct __una_u32 *)p;
       return ptr->x;
    '''
    ptr = KValue(GDBType.basic('u32').pointer(), p)
    return ptr.dereference().value_uint(ptr_size)

def __k_cut(key: int, index: int) -> int:
    return (key >> (index * 8)) & 0xff
