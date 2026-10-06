import { useEffect, useMemo, useState } from "react";
import { AvatarRenderer } from "./AvatarRenderer";
import { BehaviorOrchestrator } from "./BehaviorOrchestrator";
import { CompanionChat } from "./CompanionChat";
import type { BodyPose } from "./MotionController";
import type { FaceState } from "./ExpressionController";
import "./companion.css";

const initialPose: BodyPose = {
  hipShift: 0,
  torsoLean: 0,
  headNod: 0,
  armSwing: 0,
  legSwing: 0,
};

const initialFace: FaceState = {
  brow: 0.1,
  smile: 0.2,
  mouthOpen: 0.05,
  blinkLeft: 0,
  blinkRight: 0,
};

export function CompanionScene() {
  const orchestrator = useMemo(() => new BehaviorOrchestrator(), []);
  const [pose, setPose] = useState<BodyPose>(initialPose);
  const [face, setFace] = useState<FaceState>(initialFace);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const run = () => {
      frame = requestAnimationFrame(run);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const next = orchestrator.tick(dt);
      setPose(next.pose);
      setFace(next.face);
    };
    run();
    return () => cancelAnimationFrame(frame);
  }, [orchestrator]);

  return (
    <div className="companion-root">
      <header className="companion-header drag-region">
        <div>Maya - Virtual Companion</div>
        <div className="sub">Brown hair, light skin, expressive motion rig</div>
      </header>
      <AvatarRenderer pose={pose} face={face} />
      <CompanionChat onUserMessage={(text) => orchestrator.handleUserMessage(text)} />
    </div>
  );
}
