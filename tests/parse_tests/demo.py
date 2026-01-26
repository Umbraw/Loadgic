import os
import sys
from math import sqrt, pi
from collections import defaultdict


def decorator(func):
    return func


@decorator
def greet(name: str) -> str:
    return f"Hello {name}"


class Runner:
    def __init__(self, name: str) -> None:
        self.name = name

    def run(self) -> None:
        print(sqrt(9))


VALUE = 42

if __name__ == "__main__":
    runner = Runner("Loadgic")
    runner.run()
    print(pi)
