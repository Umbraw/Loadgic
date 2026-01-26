#include <iostream>
#include <vector>

namespace demo {
  struct Point {
    int x;
    int y;
  };
}

typedef std::vector<int> Ints;

enum class Status {
  Idle,
  Running
};

static int global_counter = 0;

int add(int a, int b) {
  return a + b;
}

int main() {
  demo::Point p{1, 2};
  global_counter = add(p.x, p.y);
  std::cout << global_counter << std::endl;
  return 0;
}
