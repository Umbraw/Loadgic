using System;
using System.Collections.Generic;

namespace Loadgic.Demo {
  public interface IRunner {
    void Run();
  }

  public enum Status {
    Idle,
    Running
  }

  public struct Point {
    public int X;
    public int Y;
  }

  public class Demo : IRunner {
    private static int _counter = 0;
    public string Name { get; set; } = "Demo";

    public void Run() {
      _counter += 1;
      Console.WriteLine($"{Name} {_counter}");
    }

    public static void Main() {
      var demo = new Demo();
      demo.Run();
    }
  }
}
