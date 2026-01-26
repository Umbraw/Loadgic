#include <stdio.h>
#include <stdint.h>

typedef struct Point {
  int x;
  int y;
} Point;

enum Status {
  STATUS_IDLE = 0,
  STATUS_RUNNING = 1
};

static int global_count = 0;

int add(int a, int b) {
  return a + b;
}

int main(void) {
  Point p = {1, 2};
  global_count = add(p.x, p.y);
  printf("%d\n", global_count);
  return 0;
}
