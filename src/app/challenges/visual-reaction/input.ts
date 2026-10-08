/** Tracks physical key presses independently of React renders and trial changes. */
export class KeyLatch {
  private held = new Set<string>();
  press(code: string, repeat: boolean): boolean {
    const accepted = !repeat && !this.held.has(code);
    this.held.add(code);
    return accepted;
  }
  release(code: string) { this.held.delete(code); }
  clear() { this.held.clear(); }
}
