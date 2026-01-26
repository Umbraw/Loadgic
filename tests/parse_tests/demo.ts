export interface User {
  id: number
  name: string
}

export type Status = 'active' | 'paused'

export enum Role {
  Admin = 'admin',
  User = 'user'
}

export class Runner {
  constructor(private readonly name: string) {}

  greet(): string {
    return `Hello ${this.name}`
  }
}

export function greet(user: User): string {
  return `Hello ${user.name}`
}

const localValue = 42

export { localValue }
