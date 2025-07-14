from typing import List, Tuple, Optional
import matplotlib.pyplot as plt

def generate_activity_heatmap(
    timestamps: List[int],
    counts: List[int],
    buckets: int = 10,
    normalize: bool = True,
    return_bins: bool = False,
    plot: bool = False,
    title: Optional[str] = None
) -> List[float] or Tuple[List[float], List[Tuple[int, int]]]:
    t_min, t_max = (min(timestamps), max(timestamps)) if timestamps else (0, 0)
    span = max(t_max - t_min, 1)
    bucket_size = span / buckets

    # initialize aggregates
    agg = [0] * buckets
    bins: List[Tuple[int, int]] = []
    for i in range(buckets):
        start = int(t_min + i * bucket_size)
        end = int(t_min + (i + 1) * bucket_size)
        bins.append((start, end))

    # bucketize counts
    for t, c in zip(timestamps, counts):
        idx = min(buckets - 1, int((t - t_min) / bucket_size))
        agg[idx] += c

    # normalize if requested
    if normalize:
        m = max(agg) or 1
        values = [val / m for val in agg]
    else:
        values = agg

    # optional plotting
    if plot:
        labels = [f"{bin_start}-{bin_end}" for bin_start, bin_end in bins]
        plt.figure(figsize=(8, 4))
        plt.bar(range(buckets), values, tick_label=labels)
        plt.xticks(rotation=45, ha="right")
        plt.ylabel("Normalized Count" if normalize else "Count")
        if title:
            plt.title(title)
        plt.tight_layout()
        plt.show()

    return (values, bins) if return_bins else values
