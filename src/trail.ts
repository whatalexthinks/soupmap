/** Plays a broth trail: fly to each stop, open its card, linger, move on. Stoppable at any time. */
import type { Trail } from "./data/trails.ts";

export interface TrailHost {
  /** Select the shop, open its card and fly there; resolves when the camera arrives. */
  visit(slug: string): Promise<void>;
  announce(message: string): void;
  onChange(playing: boolean): void;
  cancelFlight(): void;
}

export class TrailPlayer {
  private run = 0;
  private active = false;
  /** Ends the current pause early. */
  private wake: (() => void) | null = null;

  constructor(private readonly host: TrailHost) {}

  get playing(): boolean {
    return this.active;
  }

  async play(trail: Trail): Promise<void> {
    const run = ++this.run;
    this.active = true;
    this.host.onChange(true);
    for (const [i, slug] of trail.stops.entries()) {
      if (run !== this.run) return;
      this.host.announce(`${trail.name} · stop ${i + 1} of ${trail.stops.length}`);
      await this.host.visit(slug);
      if (run !== this.run) return;
      await this.pause(trail.pauseMs);
    }
    if (run === this.run) {
      this.host.announce(`That's the ${trail.name}. Gochisōsama!`);
      this.finish();
    }
  }

  stop(): void {
    if (!this.active) return;
    this.run++;
    this.host.cancelFlight();
    this.finish();
  }

  private finish(): void {
    this.active = false;
    const wake = this.wake;
    this.wake = null;
    wake?.();
    this.host.onChange(false);
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}
