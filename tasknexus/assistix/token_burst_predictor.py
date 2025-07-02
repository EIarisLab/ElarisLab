

from typing import List, Dict

def detect_volume_bursts(
    volumes: List[float],
    threshold_ratio: float = 1.5,
    min_interval: int = 1
) -> List[Dict[str, float]]:
    """
    Identify indices where volume jumps by threshold_ratio over previous.
    Returns list of dicts: {index, previous, current, ratio}.
    """
    events = []
    last_idx = -min_interval
    for i in range(1, len(volumes)):
        prev, curr = volumes[i - 1], volumes[i]
        ratio = (curr / prev) if prev > 0 else float('inf')
        if ratio >= threshold_ratio and (i - last_idx) >= min_interval:
            events.append({
                "index": float(i),
                "previous": prev,
                "current": curr,
                "ratio": round(ratio, 4)
            })
            last_idx = i
    return events
