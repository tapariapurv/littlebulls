"""Run: .venv/bin/python tests/api_check.py  (no network)"""
import sys, threading, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import requests
from api.index import fix_wicks, merge, shared

# One call however many ask at once.
calls = []
def slow():
    calls.append(1); time.sleep(.05); return "price"
threads = [threading.Thread(target=shared, args=("a", 5, slow)) for _ in range(50)]
[t.start() for t in threads]; [t.join() for t in threads]
assert len(calls) == 1 and shared("a", 5, slow) == "price"

# A failure with an earlier answer serves that answer, and doesn't retry for 5 seconds.
def fail():
    calls.append(1); raise requests.RequestException("down")
shared("b", 0, lambda: "old")
calls.clear()
assert shared("b", 0, fail, stale=60) == "old" and shared("b", 0, fail, stale=60) == "old" and len(calls) == 1

# A failure with no earlier answer raises, also without retrying.
calls.clear()
for _ in range(2):
    try:
        shared("c", 5, fail)
        raise AssertionError
    except requests.RequestException:
        pass
assert len(calls) == 1

assert fix_wicks(100, 101, 5, 100) == (100, 101)  # broken low
assert fix_wicks(100, 900, 99, 100) == (99, 100)  # broken high
assert fix_wicks(100, 110, 90, 105) == (90, 110)  # a real move stays

bars = [{"t": i, "o": i, "h": i + 1, "l": i - 1, "c": i + .5} for i in range(7)]
m = merge(bars, 3)
assert [b["t"] for b in m] == [0, 1, 4] and m[-1] == {"t": 4, "o": 4, "h": 7, "l": 3, "c": 6.5}  # newest bar is whole
print("api ok")
