package demo

import (
  "fmt"
  "strings"
)

type Runner interface {
  Run()
}

type Point struct {
  X int
  Y int
}

type Status int

const (
  StatusIdle Status = iota
  StatusRunning
)

var globalCount = 0

func Add(a int, b int) int {
  return a + b
}

func (p Point) String() string {
  return fmt.Sprintf("%d,%d", p.X, p.Y)
}

func main() {
  p := Point{X: 1, Y: 2}
  globalCount = Add(p.X, p.Y)
  fmt.Println(strings.ToUpper(p.String()))
}
