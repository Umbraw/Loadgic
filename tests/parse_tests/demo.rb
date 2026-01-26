require 'json'
require_relative 'helper'

module Loadgic
  VERSION = '1.0.0'

  class Runner
    def initialize(name)
      @name = name
    end

    def run
      puts "Hello #{@name}"
    end
  end

  def self.greet(name)
    "Hello #{name}"
  end
end

value = 42

runner = Loadgic::Runner.new('Loadgic')
runner.run
