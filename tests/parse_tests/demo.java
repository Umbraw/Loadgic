package com.loadgic.demo;

import java.util.List;
import java.util.ArrayList;

interface Runner {
  void run();
}

enum Status {
  IDLE,
  RUNNING
}

public class Demo implements Runner {
  private static int counter = 0;
  private String name = "Demo";

  public Demo(String name) {
    this.name = name;
  }

  public String greet(String target) {
    return "Hello " + target;
  }

  @Override
  public void run() {
    counter += 1;
    System.out.println(greet(name));
  }

  public static void main(String[] args) {
    List<String> names = new ArrayList<>();
    names.add("Loadgic");
    new Demo(names.get(0)).run();
  }
}
