import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { BodyPose } from "./MotionController";
import type { FaceState } from "./ExpressionController";

type Props = {
  pose: BodyPose;
  face: FaceState;
};

function makeMat(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
}

export function AvatarRenderer({ pose, face }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<{
    root: THREE.Group;
    torso: THREE.Mesh;
    head: THREE.Mesh;
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
    faceTexture: THREE.CanvasTexture;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 1.55, 4.3);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight("#fff2db", 1.0));
    const key = new THREE.DirectionalLight("#ffffff", 1.1);
    key.position.set(2, 4, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#b9f3ff", 0.6);
    fill.position.set(-4, 2, 0);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.95, 8, 16), makeMat("#c6932a"));
    torso.position.y = 1.1;
    root.add(torso);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.35), makeMat("#40485d"));
    pelvis.position.y = 0.55;
    root.add(pelvis);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.18), makeMat("#f1c8a8"));
    neck.position.y = 1.73;
    root.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 32), makeMat("#f7d8bd"));
    head.position.y = 2.08;
    root.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.41, 24, 24), makeMat("#5a3a2e"));
    hair.position.set(0, 2.05, -0.08);
    hair.scale.set(1, 1.15, 1.05);
    root.add(hair);

    const hairLeft = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.9, 6, 12), makeMat("#4a2f24"));
    hairLeft.position.set(-0.33, 1.7, -0.05);
    hairLeft.rotation.z = 0.12;
    root.add(hairLeft);

    const hairRight = hairLeft.clone();
    hairRight.position.x = 0.33;
    hairRight.rotation.z = -0.12;
    root.add(hairRight);

    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = 512;
    faceCanvas.height = 512;
    faceCanvasRef.current = faceCanvas;
    const faceTexture = new THREE.CanvasTexture(faceCanvas);
    const facePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.48),
      new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true })
    );
    facePlane.position.set(0, 2.06, 0.33);
    root.add(facePlane);

    function makeLimb(upperColor: string) {
      const group = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.45, 6, 12), makeMat(upperColor));
      upper.position.y = -0.25;
      group.add(upper);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 6, 12), makeMat(upperColor));
      lower.position.y = -0.74;
      group.add(lower);
      return group;
    }

    const leftArm = makeLimb("#c6932a");
    leftArm.position.set(-0.48, 1.43, 0);
    root.add(leftArm);
    const rightArm = makeLimb("#c6932a");
    rightArm.position.set(0.48, 1.43, 0);
    root.add(rightArm);

    const leftLeg = makeLimb("#40485d");
    leftLeg.position.set(-0.22, 0.44, 0);
    root.add(leftLeg);
    const rightLeg = makeLimb("#40485d");
    rightLeg.position.set(0.22, 0.44, 0);
    root.add(rightLeg);

    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.5), makeMat("#2d8d80"));
    leftBoot.position.set(-0.22, -0.32, 0.1);
    root.add(leftBoot);
    const rightBoot = leftBoot.clone();
    rightBoot.position.x = 0.22;
    root.add(rightBoot);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 30),
      new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.2 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.45;
    root.add(shadow);

    rigRef.current = { root, torso, head, leftArm, rightArm, leftLeg, rightLeg, faceTexture };

    const clock = new THREE.Clock();
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      root.position.y = Math.sin(t * 1.7) * 0.03;
      root.rotation.y = Math.sin(t * 0.7) * 0.08;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.root.position.x = pose.hipShift;
    rig.torso.rotation.z = pose.torsoLean;
    rig.head.rotation.x = pose.headNod;
    rig.leftArm.rotation.z = 0.4 + pose.armSwing;
    rig.rightArm.rotation.z = -0.4 - pose.armSwing;
    rig.leftLeg.rotation.x = pose.legSwing;
    rig.rightLeg.rotation.x = -pose.legSwing;
  }, [pose]);

  useEffect(() => {
    const canvas = faceCanvasRef.current;
    const rig = rigRef.current;
    if (!canvas || !rig) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const eyeHeight = 26 * (1 - face.blinkLeft * 0.92);
    const eyeY = 205;
    const leftX = 178;
    const rightX = 334;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#3a2219";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(leftX, eyeY, 34, Math.max(2, eyeHeight), 0, 0, Math.PI * 2);
    ctx.ellipse(rightX, eyeY, 34, Math.max(2, eyeHeight), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const pupilOffset = Math.sin(Date.now() * 0.002) * 5;
    ctx.fillStyle = "#261812";
    ctx.beginPath();
    ctx.arc(leftX + pupilOffset, eyeY + 4, 12, 0, Math.PI * 2);
    ctx.arc(rightX + pupilOffset, eyeY + 4, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5a3a2d";
    ctx.lineWidth = 9;
    const browTilt = face.brow * 22;
    ctx.beginPath();
    ctx.moveTo(145, 145 + browTilt);
    ctx.lineTo(215, 132);
    ctx.moveTo(297, 132);
    ctx.lineTo(367, 145 + browTilt);
    ctx.stroke();

    ctx.strokeStyle = "#8d4c49";
    ctx.lineWidth = 8;
    const smileArc = 22 + face.smile * 45;
    const mouthOpen = 12 + face.mouthOpen * 24;
    ctx.beginPath();
    ctx.ellipse(256, 318, smileArc, mouthOpen, 0, 0, Math.PI, false);
    ctx.stroke();

    rig.faceTexture.needsUpdate = true;
  }, [face]);

  return <div className="companion-canvas" ref={mountRef} />;
}
