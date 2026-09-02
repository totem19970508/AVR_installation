from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class SkylightInstallation:
    plan_no: str
    region: str
    row: str
    position: str
    measured_dimensions: float
    xbar_coverage_size: float
    pixels: int
    actual_length: float
    progress: dict[str, int | None]
    cutting_length: float | None
    cutted_pixel: int
    actual_cutted_pixel: int | None = None
    remarks: str | None = None

    def __post_init__(self) -> None:
        for name in ("plan_no", "region", "row", "position"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} is required")

        numeric_values = (
            self.measured_dimensions,
            self.xbar_coverage_size,
            self.pixels,
            self.actual_length,
            self.cutted_pixel,
        )
        if min(numeric_values) < 0:
            raise ValueError("Measurement and pixel values cannot be negative")
        optional_values = (self.cutting_length, self.actual_cutted_pixel)
        if any(value is not None and value < 0 for value in optional_values):
            raise ValueError("Optional cutting values cannot be negative")

        expected_checkpoints = {"2000_mm", "1500_mm", "1000_mm"}
        if set(self.progress) != expected_checkpoints:
            raise ValueError(f"progress must contain {sorted(expected_checkpoints)}")
        if any(value is not None and value < 0 for value in self.progress.values()):
            raise ValueError("Progress values cannot be negative")

    def to_firestore(self) -> dict[str, Any]:
        return asdict(self)

