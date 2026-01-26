use std::collections::HashMap;

mod helpers {
  pub fn greet(name: &str) -> String {
    format!("Hello {}", name)
  }
}

trait Runner {
  fn run(&self) -> String;
}

type Score = i32;

struct User {
  name: String,
  score: Score,
}

enum Status {
  Idle,
  Running,
}

impl Runner for User {
  fn run(&self) -> String {
    helpers::greet(&self.name)
  }
}

const VERSION: &str = "1.0.0";

fn main() {
  let user = User {
    name: "Loadgic".to_string(),
    score: 10,
  };
  let mut map: HashMap<String, i32> = HashMap::new();
  map.insert(user.name.clone(), user.score);
  println!("{}", user.run());
}
