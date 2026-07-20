"""
Copyright 2025 Hanzhi Liu, Yanyan Jiang, and Chang Xu.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.

Modifications:
- Copyright 2026 myeonghyeon.park.
    - renaming visualinux-gdb.py to gdb_command.py.
    - removing VChat command.
"""

# manually set the import path for in-gdb usage

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
# sys.setrecursionlimit(1000)

# loadin the customized gdb commands.
# see core.py for the start point of ViewCL parsing and object graph extraction.

from visualinux.common import *
from visualinux.cmd import *
from visualinux.jhash_test import *

try:
    VPlot()
    VCtrl()
    VDiff()
except:
    raise fuck_exc(AssertionError, 'internal error on loading v-commands')
