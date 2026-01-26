<?php

namespace Loadgic\Demo;

use DateTime;
use ArrayObject as Arr;

interface Runner {
  public function run(): void;
}

trait LoggerTrait {
  public function log(string $message): void {
    echo $message;
  }
}

class Demo implements Runner {
  use LoggerTrait;

  public const VERSION = '1.0.0';
  private static int $counter = 0;
  public string $name;

  public function __construct(string $name) {
    $this->name = $name;
  }

  public function run(): void {
    self::$counter += 1;
    $this->log($this->name . ' ' . self::$counter);
  }
}

function greet(string $name): string {
  $now = new DateTime();
  return "Hello $name at " . $now->format('c');
}

$demo = new Demo('Loadgic');
$demo->run();
