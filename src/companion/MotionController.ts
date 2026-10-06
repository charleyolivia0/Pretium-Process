import type { Mood } from "./PersonalityEngine";

export type BodyPose = {
  hipShift: number;
  torsoLean: number;
  headNod: number;
  armSwing: number;
  legSwing: number;
};

export class MotionController {
  private mood: Mood = "calm";
  private intensity = 0.5;
  private elapsed = 0;

  setMood(mood: Mood, intensity: number) {
    this.mood = mood;
    this.intensity = intensity;
  }

  update(dt: number): BodyPose {
    this.elapsed += dt;
    const freq = this.mood === "happy" ? 2.1 : this.mood === "focused" ? 1.3 : 1.6;
    const amp = 0.05 + this.intensity * 0.13;
    const sway = Math.sin(this.elapsed * freq) * amp;
    const alt = Math.sin(this.elapsed * freq * 0.5 + 1.2) * amp;

    return {
      hipShift: sway,
      torsoLean: alt * 0.5,
      headNod: Math.sin(this.elapsed * (freq + 0.5)) * amp * 0.6,
      armSwing: sway * 1.7,
      legSwing: -sway * 1.4,
    };
  }
}
