"""Loadgic Python demo with a realistic mix of comment styles."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Iterable, Iterator, Optional, Protocol, TypedDict, Literal


# Module-level note: this file mixes docstyles seen in real projects.


class Status(str, Enum):
    """Status values used by the demo."""

    OK = "ok"
    ERROR = "error"


class SupportsLen(Protocol):
    """Protocol to test structural typing."""

    def __len__(self) -> int: ...


class Config(TypedDict):
    """Typed dictionary for configuration."""

    name: str
    retries: int
    debug: bool


@dataclass
class User:
    """Represents an application user."""

    name: str
    age: int
    tags: list[str] = field(default_factory=list)  # trailing comment

    @property
    def is_adult(self) -> bool:
        """Returns True if the user is 18+ years old."""

        return self.age >= 18

    # Google-style docstring
    def greet(self, loud: bool = False) -> str:
        """Formats a greeting message.

        Args:
            loud: If true, returns uppercase.

        Returns:
            The greeting string.
        """

        msg = f"Hello, {self.name}"
        return msg.upper() if loud else msg

    # NumPy-style docstring
    def nickname(self, suffix: str = "!") -> str:
        """Build a nickname.

        Parameters
        ----------
        suffix : str
            Suffix appended to name.

        Returns
        -------
        str
            Nickname with suffix.
        """

        return f"{self.name}{suffix}"

    @classmethod
    def guest(cls) -> "User":
        """Factory for a guest user."""

        return cls(name="Guest", age=0)

    @staticmethod
    def normalize_name(name: str) -> str:
        """Normalize a name.

        :param name: Raw input name.
        :return: Normalized version.
        """

        return name.strip().title()


class Counter:
    """Simple counter with a custom iterator."""

    def __init__(self, start: int = 0) -> None:
        # NOTE: We keep internal value private.
        self._value = start

    def inc(self) -> int:
        """Increment by one and return the new value."""

        self._value += 1
        return self._value

    def __iter__(self) -> Iterator[int]:
        """Infinite iterator."""

        while True:
            yield self.inc()


# reST / Sphinx style (often used in older codebases)
# :param path: path or string
# :return: Path instance
# :raises ValueError: if empty
def ensure_path(path: str | Path) -> Path:
    """Ensures a Path instance."""

    if not path:
        raise ValueError("Empty path")
    return path if isinstance(path, Path) else Path(path)


# Short comment above a helper
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


class AppError(Exception):
    """Custom exception."""


def choose_mode(mode: Literal["fast", "safe"]) -> str:
    """Accepts a literal type.

    Examples:
        >>> choose_mode("fast")
        'fast'
    """

    return mode


def main() -> None:
    """Entrypoint used for manual testing."""

    config: Config = {"name": "Loadgic", "retries": 3, "debug": True}
    user = User(name="Alice", age=30)
    counter = Counter()
    print(user.greet())
    print(user.nickname("?"))
    print(counter.inc())
    print(config["name"], choose_mode("fast"))


if __name__ == "__main__":
    main()
