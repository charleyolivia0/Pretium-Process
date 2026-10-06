import { ExpressionController, type FaceState } from "./ExpressionController";
import { MotionController, type BodyPose } from "./MotionController";
import { PersonalityEngine } from "./PersonalityEngine";

export class BehaviorOrchestrator {
  private personality = new PersonalityEngine();
  private expressions = new ExpressionController();
  private motion = new MotionController();

  handleUserMessage(input: string): string {
    const reply = this.personality.respond(input);
    this.expressions.setMood(reply.mood, reply.intensity);
    this.motion.setMood(reply.mood, reply.intensity);
    return reply.text;
  }

  tick(dt: number): { pose: BodyPose; face: FaceState } {
    return {
      pose: this.motion.update(dt),
      face: this.expressions.update(dt),
    };
  }
}
