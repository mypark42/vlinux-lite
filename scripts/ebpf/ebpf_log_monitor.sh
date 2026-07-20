#!/bin/sh

echo "Starting eBPF log monitor..."

while true; do
    if [ -r /sys/kernel/debug/tracing/trace_pipe ]; then
        cat /sys/kernel/debug/tracing/trace_pipe | while read line; do
            echo $line
        done
    else
        echo "Warning: Cannot read trace_pipe, retrying in 5 seconds..."
        sleep 5
    fi
done
