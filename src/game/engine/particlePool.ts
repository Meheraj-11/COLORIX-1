import Phaser from 'phaser';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
  shape: 'circle' | 'diamond' | 'ring';
}

const POOL_SIZE = 180;

export class ParticlePool {
  private pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
        color: 0xffffff,
        alpha: 1,
        life: 0,
        maxLife: 0.4,
        gravity: 0,
        shape: 'circle',
      });
    }
  }

  public clear(): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool[i].active = false;
    }
  }

  public emit(
    x: number,
    y: number,
    count: number,
    color: number,
    opts?: {
      speedMin?: number;
      speedMax?: number;
      sizeMin?: number;
      sizeMax?: number;
      lifeMin?: number;
      lifeMax?: number;
      gravity?: number;
      angleMin?: number;
      angleMax?: number;
      shape?: 'circle' | 'diamond' | 'ring';
    },
  ): void {
    const sMin = opts?.speedMin ?? 40;
    const sMax = opts?.speedMax ?? 160;
    const szMin = opts?.sizeMin ?? 2.5;
    const szMax = opts?.sizeMax ?? 5.5;
    const lMin = opts?.lifeMin ?? 0.25;
    const lMax = opts?.lifeMax ?? 0.55;
    const grav = opts?.gravity ?? 120;
    const aMin = opts?.angleMin ?? 0;
    const aMax = opts?.angleMax ?? Math.PI * 2;
    const shape = opts?.shape ?? 'circle';

    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % POOL_SIZE;
      const angle = aMin + Math.random() * (aMax - aMin);
      const speed = sMin + Math.random() * (sMax - sMin);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = szMin + Math.random() * (szMax - szMin);
      p.color = color;
      p.alpha = 1;
      p.maxLife = lMin + Math.random() * (lMax - lMin);
      p.life = p.maxLife;
      p.gravity = grav;
      p.shape = shape;
    }
  }

  public emitRing(x: number, y: number, color: number, maxSize = 48): void {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % POOL_SIZE;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.size = maxSize;
    p.color = color;
    p.alpha = 0.85;
    p.maxLife = 0.34;
    p.life = 0.34;
    p.gravity = 0;
    p.shape = 'ring';
  }

  public update(dt: number): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.shape !== 'ring') {
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.alpha = Math.max(0, p.life / p.maxLife);
    }
  }

  public render(g: Phaser.GameObjects.Graphics): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      if (p.shape === 'ring') {
        const progress = 1 - p.life / p.maxLife;
        const radius = 8 + p.size * progress;
        g.lineStyle(2.5 * (1 - progress) + 0.8, p.color, p.alpha * 0.85);
        g.strokeCircle(p.x, p.y, radius);
      } else if (p.shape === 'diamond') {
        const r = p.size * (0.45 + 0.55 * p.alpha);
        g.fillStyle(p.color, p.alpha);
        g.beginPath();
        g.moveTo(p.x, p.y - r);
        g.lineTo(p.x + r, p.y);
        g.lineTo(p.x, p.y + r);
        g.lineTo(p.x - r, p.y);
        g.closePath();
        g.fillPath();
      } else {
        g.fillStyle(p.color, p.alpha);
        g.fillCircle(p.x, p.y, p.size * (0.4 + 0.6 * p.alpha));
      }
    }
  }
}
