import type { Mood } from "./PersonalityEngine";

export type FaceState = {
  brow: number;
  smile: number;
  mouthOpen: number;
  blinkLeft: number;
  blinkRight: number;
};

export class ExpressionController {
  private target: FaceState = { brow: 0.1, smile: 0.2, mouthOpen: 0.05, blinkLeft: 0, blinkRight: 0 };
  private current: FaceState = { ...this.target };
  private blinkTimer = 0;

  setMood(mood: Mood, intensity: number) {
    const t = Math.min(1, Math.max(0, intensity));
    switch (mood) {
      case "happy":
        this.target = { brow: 0.15, smile: 0.75 * t, mouthOpen: 0.2 * t, blinkLeft: 0, blinkRight: 0 };
        break;
      case "curious":
        this.target = { brow: 0.55 * t, smile: 0.25, mouthOpen: 0.12, blinkLeft: 0, blinkRight: 0 };
        break;
      case "focused":
        this.target = { brow: 0.3, smile: 0.1, mouthOpen: 0.08, blinkLeft: 0, blinkRight: 0 };
        break;
      case "supportive":
        this.target = { brow: 0.2, smile: 0.45, mouthOpen: 0.1, blinkLeft: 0, blinkRight: 0 };
        break;
      default:
        this.target = { brow: 0.1, smile: 0.2, mouthOpen: 0.06, blinkLeft: 0, blinkRight: 0 };
    }
  }

  update(dt: number): FaceState {
    const speed = 6;
    this.current.brow += (this.target.brow - this.current.brow) * dt * speed;
    this.current.smile += (this.target.smile - this.current.smile) * dt * speed;
    this.current.mouthOpen += (this.target.mouthOpen - this.current.mouthOpen) * dt * speed;

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.current.blinkLeft = 1;
      this.current.blinkRight = 1;
      this.blinkTimer = 2 + Math.random() * 3.5;
    } else {
      this.current.blinkLeft += (0 - this.current.blinkLeft) * dt * 20;
      this.current.blinkRight += (0 - this.current.blinkRight) * dt * 20;
    }

    return this.current;
  }
}
