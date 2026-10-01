export class Camera {
  x = 0; y = 0; zoom = 2; targetZoom = 2;
  shakeA = 0;
  w = 800; h = 600;
  follow(tx: number, ty: number, dt: number) {
    const k = 1 - Math.exp(-dt * 8);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-dt * 10));
    this.shakeA = Math.max(0, this.shakeA - dt * 18);
  }
  /** canto superior esquerdo em coordenadas de mundo */
  left() { return this.x - this.w / 2 / this.zoom + (Math.random() - 0.5) * this.shakeA * 0.6; }
  top() { return this.y - this.h / 2 / this.zoom + (Math.random() - 0.5) * this.shakeA * 0.6; }
}
