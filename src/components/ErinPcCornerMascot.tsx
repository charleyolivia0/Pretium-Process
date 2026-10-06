import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ALEX_MIDDLETON_PM_NAMES,
  ERIN_LEINBERGER_PC_NAME,
  GRAYSON_PM_NAMES,
  JIMMY_CAO_PC_NAME,
  SCOT_PATERSON_PM_NAMES,
  TAMARA_EINFELD_PM_NAMES,
  personNameMatchesTarget,
  projectMatchesJobNumber,
} from "../utils/erinPc";
import { projectIdFromAppLocation } from "../utils/projectLocation";

type AssignmentUserRow = {
  _id: Id<"users">;
  name: string;
  role?: string | null;
};

export type PcCornerMascotModel = {
  coordinatorMascotSrc: string;
  effectiveShowJimmy: boolean;
  showCoordinatorMascot: boolean;
  showPmAlex: boolean;
  showPmScot: boolean;
  showPmGrayson: boolean;
  showPmTamara: boolean;
  isP2606: boolean;
};

/**
 * Resolved bottom-right PC/PM mascot for the current project URL, or null when none apply.
 * Used by AppLayout to hide the default notification shimeji when this mascot is shown.
 */
export function usePcCornerMascotModel(): PcCornerMascotModel | null {
  const { pathname, search } = useLocation();
  const projectId = useMemo(() => projectIdFromAppLocation(pathname, search), [pathname, search]);

  const project = useQuery(
    api.projects.getProjectById,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
  const usersForAssignment = useQuery(api.users.listUsersForAssignment);

  const erinUserId = useMemo(() => {
    const match = (usersForAssignment as AssignmentUserRow[] | undefined)?.find(
      (u) => u.role === "coordinator" && personNameMatchesTarget(u.name, ERIN_LEINBERGER_PC_NAME)
    );
    return match?._id ?? null;
  }, [usersForAssignment]);
  const jimmyUserId = useMemo(() => {
    const match = (usersForAssignment as AssignmentUserRow[] | undefined)?.find(
      (u) => u.role === "coordinator" && personNameMatchesTarget(u.name, JIMMY_CAO_PC_NAME)
    );
    return match?._id ?? null;
  }, [usersForAssignment]);
  const pmUser = useMemo(() => {
    const users = usersForAssignment as AssignmentUserRow[] | undefined;
    if (!project?.pmId || !users) return null;
    return users.find((u) => u._id === project.pmId) ?? null;
  }, [usersForAssignment, project?.pmId]);

  const pmIsAlex = useMemo(
    () =>
      pmUser != null &&
      ALEX_MIDDLETON_PM_NAMES.some((t) => personNameMatchesTarget(pmUser.name, t)),
    [pmUser]
  );
  const pmIsScot = useMemo(
    () =>
      pmUser != null &&
      SCOT_PATERSON_PM_NAMES.some((t) => personNameMatchesTarget(pmUser.name, t)),
    [pmUser]
  );
  const pmIsGrayson = useMemo(
    () =>
      pmUser != null && GRAYSON_PM_NAMES.some((t) => personNameMatchesTarget(pmUser.name, t)),
    [pmUser]
  );
  const pmIsTamara = useMemo(
    () =>
      pmUser != null &&
      TAMARA_EINFELD_PM_NAMES.some((t) => personNameMatchesTarget(pmUser.name, t)),
    [pmUser]
  );

  const showErin =
    project != null &&
    project.coordinatorId != null &&
    erinUserId != null &&
    project.coordinatorId === erinUserId;
  const showJimmy =
    project != null &&
    project.coordinatorId != null &&
    jimmyUserId != null &&
    project.coordinatorId === jimmyUserId;
  const showAlex = project != null && project.pmId != null && pmIsAlex;
  const showScot = project != null && project.pmId != null && pmIsScot && !pmIsAlex;
  const showGrayson = project != null && project.pmId != null && pmIsGrayson;
  const showTamara = project != null && project.pmId != null && pmIsTamara;

  const isP2540 = projectMatchesJobNumber(project, "2540");
  const isP2551 = projectMatchesJobNumber(project, "2551");
  const isP2606 = projectMatchesJobNumber(project, "2606");
  const effectiveShowJimmy = showJimmy || isP2540;
  const effectiveShowErin = showErin && !isP2540;
  const showCoordinatorMascot = effectiveShowErin || effectiveShowJimmy;
  const showPmAlex = showAlex && !isP2540;
  const showPmGrayson = showGrayson;
  const showPmTamara = showTamara;
  const showPmScot =
    !effectiveShowJimmy && !showPmAlex && !showPmGrayson && !showPmTamara && showScot && !isP2551;

  if (!showCoordinatorMascot && !showAlex && !showScot && !showGrayson && !showTamara) return null;

  const coordinatorMascotSrc = effectiveShowJimmy
    ? "/images/jimmy-cao-pc-mascot.png?v=2"
    : "/images/erin-pc-mascot.png?v=4";

  return {
    coordinatorMascotSrc,
    effectiveShowJimmy,
    showCoordinatorMascot,
    showPmAlex,
    showPmScot,
    showPmGrayson,
    showPmTamara,
    isP2606,
  };
}

/**
 * Fixed bottom-right mascot(s) for selected PM/PC project assignments.
 */
export function ErinPcCornerMascot() {
  const m = usePcCornerMascotModel();
  if (!m) return null;

  const {
    coordinatorMascotSrc,
    effectiveShowJimmy,
    showCoordinatorMascot,
    showPmAlex,
    showPmScot,
    showPmGrayson,
    showPmTamara,
    isP2606,
  } = m;

  const graysonPairCoordinatorTransform = effectiveShowJimmy
    ? "scaleX(-1) translateY(20px)"
    : "scaleX(-1) translateY(0px)";

  const coordinatorTransform = effectiveShowJimmy
    ? "translateY(20px)"
    : isP2606
      ? "scaleX(-1) translateY(0px)"
      : "translateY(0px)";

  const singleImageStyle = {
    width: "auto",
    maxWidth: "min(24vw, 150px)",
    height: "auto",
    maxHeight: "min(32vh, 168px)",
    objectFit: "contain" as const,
    pointerEvents: "none" as const,
    userSelect: "none" as const,
    filter: "drop-shadow(0 6px 10px rgba(0, 0, 0, 0.2))",
  };

  return (
    <div
      style={{
        position: "fixed",
        right: "0",
        bottom: "0",
        display: "flex",
        alignItems: "flex-end",
        gap: "0.45rem",
        pointerEvents: "none",
        zIndex: 1200,
      }}
    >
      {showPmAlex && showCoordinatorMascot && (
        <img
          src="/images/alex-pm-mascot.png?v=2"
          alt=""
          aria-hidden
          style={{
            ...singleImageStyle,
            maxWidth: "min(26vw, 164px)",
            maxHeight: "min(34vh, 182px)",
            transform: "translateY(0px)",
          }}
        />
      )}
      {showPmScot && showCoordinatorMascot && (
        <img
          src="/images/scot-pm-mascot.png?v=7"
          alt=""
          aria-hidden
          style={{
            ...singleImageStyle,
            maxWidth: "min(120vw, 760px)",
            maxHeight: "min(160vh, 860px)",
            transform: "translateY(140px)",
          }}
        />
      )}
      {showPmGrayson && showCoordinatorMascot && (
        <>
          <img
            src={coordinatorMascotSrc}
            alt=""
            aria-hidden
            style={{
              ...singleImageStyle,
              maxWidth: effectiveShowJimmy ? "min(26vw, 164px)" : "min(22vw, 138px)",
              maxHeight: effectiveShowJimmy ? "min(34vh, 182px)" : "min(30vh, 154px)",
              transform: graysonPairCoordinatorTransform,
            }}
          />
          <img
            src="/images/grayson-pm-mascot.png?v=1"
            alt=""
            aria-hidden
            style={{
              ...singleImageStyle,
              maxWidth: "min(26vw, 164px)",
              maxHeight: "min(34vh, 182px)",
              transform: "translateY(20px)",
            }}
          />
        </>
      )}
      {showCoordinatorMascot && !showPmGrayson && (
        <img
          src={coordinatorMascotSrc}
          alt=""
          aria-hidden
          style={{
            ...singleImageStyle,
            maxWidth: effectiveShowJimmy ? "min(26vw, 164px)" : "min(22vw, 138px)",
            maxHeight: effectiveShowJimmy ? "min(34vh, 182px)" : "min(30vh, 154px)",
            transform: coordinatorTransform,
          }}
        />
      )}
      {showPmTamara && showCoordinatorMascot && (
        <img
          src="/images/tamara-pm-mascot.png?v=1"
          alt=""
          aria-hidden
          style={{
            ...singleImageStyle,
            maxWidth: "min(26vw, 164px)",
            maxHeight: "min(34vh, 182px)",
            transform: "translateY(0px)",
          }}
        />
      )}
      {showPmAlex && !showCoordinatorMascot && (
        <img
          src="/images/alex-pm-mascot.png?v=2"
          alt=""
          aria-hidden
          style={{
            ...singleImageStyle,
            maxWidth: "min(26vw, 164px)",
            maxHeight: "min(34vh, 182px)",
            transform: "translateY(0px)",
          }}
        />
      )}
      {showPmScot && !showCoordinatorMascot && (
        <img
          src="/images/scot-pm-mascot.png?v=7"
          alt=""
          aria-hidden
          style={{
            ...singleImageStyle,
            maxWidth: "min(120vw, 760px)",
            maxHeight: "min(160vh, 860px)",
            transform: "translateY(140px)",
          }}
        />
      )}
      {showPmGrayson && !showCoordinatorMascot && (
        <img
          src="/images/grayson-pm-mascot.png?v=1"
          alt=""
          aria-hidden
          style={{
            ...singleImageStyle,
            maxWidth: "min(26vw, 164px)",
            maxHeight: "min(34vh, 182px)",
            transform: "translateY(20px)",
          }}
        />
      )}
      {showPmTamara && !showCoordinatorMascot && (
        <img
          src="/images/tamara-pm-mascot.png?v=1"
          alt=""
          aria-hidden
          style={{
            ...singleImageStyle,
            maxWidth: "min(26vw, 164px)",
            maxHeight: "min(34vh, 182px)",
            transform: "translateY(0px)",
          }}
        />
      )}
    </div>
  );
}
