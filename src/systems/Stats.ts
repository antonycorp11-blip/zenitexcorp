export class Stats {
  cells = 0; deaths = 0; repairs = 0; calibrations = 0; explosions = 0; caveins = 0; rescues = 0;
  robots = 0; research = 0; contracts = 0; artifacts = 0; anomalies = 0; rares = 0; regrown = 0;
  crafted = 0; manualKg = 0; processed = 0; shipped = 0; built = 0;
  mined: Record<string, number> = {};
  serialize() { return { ...this }; }
  load(s: any) { Object.assign(this, s); }
}
