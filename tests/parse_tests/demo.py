"""Loadgic Python demo with rich symbols for inspector testing."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Iterable, Iterator, Optional, Protocol, TypedDict, Literal


class Status(str, Enum):
    """Simple status enum."""

    OK = "ok"
    ERROR = "error"


class SupportsLen(Protocol):
    """Protocol to test structural typing."""

    def __len__(self) -> int: ...


class Config(TypedDict):
    name: str
    retries: int
    debug: bool


@dataclass
class User:
    """Represents an application user."""

    name: str
    age: int
    tags: list[str] = field(default_factory=list)

    @property
    def is_adult(self) -> bool:
        """Returns True if the user is 18+ years old."""

        return self.age >= 18

    def greet(self, loud: bool = False) -> str:
        """Formats a greeting message.

        Args:
            loud: If true, returns uppercase.
        """

        msg = f"Hello, {self.name}"
        return msg.upper() if loud else msg

    @classmethod
    def guest(cls) -> "User":
        """Factory for a guest user."""

        return cls(name="Guest", age=0)

    @staticmethod
    def normalize_name(name: str) -> str:
        return name.strip().title()


class Counter:
    """Simple counter with a custom iterator."""

    def __init__(self, start: int = 0) -> None:
        self._value = start

    def inc(self) -> int:
        self._value += 1
        return self._value

    def __iter__(self) -> Iterator[int]:
        while True:
            yield self.inc()


def ensure_path(path: str | Path) -> Path:
    """Ensures a Path instance."""

    return path if isinstance(path, Path) else Path(path)


def add(a: int, b: int) -> int:
    """Adds two numbers together."""

    return a + b


def first_or_none(items: Iterable[str]) -> Optional[str]:
    """Returns the first item or None."""

    for item in items:
        return item
    return None


async def fetch_status(code: int) -> Status:
    """Example async function."""

    return Status.OK if code == 200 else Status.ERROR


def use_len(obj: SupportsLen) -> int:
    """Uses a protocol-typed object."""

    return len(obj)


def choose_mode(mode: Literal["fast", "safe"]) -> str:
    """Accepts a literal type."""

    return mode


class AppError(Exception):
    """Custom exception."""


def risky(value: int) -> int:
    """Raises on negative values."""

    if value < 0:
        raise AppError("Negative value")
    return value


def main() -> None:
    """Entrypoint used for manual testing."""

    config: Config = {"name": "Loadgic", "retries": 3, "debug": True}
    user = User(name="Alice", age=30)
    counter = Counter()
    print(user.greet())
    print(counter.inc())
    print(config["name"], choose_mode("fast"))


if __name__ == "__main__":
    main()
