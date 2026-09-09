interface Event {
  time: number
  sequence: number
  action: () => void
  cancelled: boolean
}
/** Stable binary min heap. Cancellation never changes the ordering of other events. */
export class EventQueue {
  private heap: Event[] = []
  private sequence = 0
  private live = 0
  get size(): number {
    return this.live
  }
  push(time: number, action: () => void): () => void {
    const e = { time, sequence: this.sequence++, action, cancelled: false }
    this.live++
    this.heap.push(e)
    let i = this.heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.less(e, this.heap[p])) break
      this.heap[i] = this.heap[p]
      i = p
    }
    this.heap[i] = e
    return () => {
      if (!e.cancelled) {
        e.cancelled = true
        this.live--
      }
    }
  }
  private less(a: Event, b: Event): boolean {
    return a.time < b.time || (a.time === b.time && a.sequence < b.sequence)
  }
  private pop(): Event | undefined {
    const first = this.heap[0],
      last = this.heap.pop()
    if (this.heap.length && last) {
      let i = 0
      while (i * 2 + 1 < this.heap.length) {
        let child = i * 2 + 1
        if (child + 1 < this.heap.length && this.less(this.heap[child + 1], this.heap[child]))
          child++
        if (!this.less(this.heap[child], last)) break
        this.heap[i] = this.heap[child]
        i = child
      }
      this.heap[i] = last
    }
    return first
  }
  peek(): Event | undefined {
    while (this.heap[0]?.cancelled) this.pop()
    return this.heap[0]
  }
  take(): Event | undefined {
    this.peek()
    const e = this.pop()
    if (e) {
      e.cancelled = true
      this.live--
    }
    return e
  }
}
