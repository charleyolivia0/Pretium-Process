import { createContext, useContext, type ReactNode } from "react";

/** When admin uses "View as", this is the role used for nav and dashboard layout. */
export const EffectiveRoleContext = createContext<{
  effectiveRole: string;
  viewAsRole: string;
  setViewAsRole: (role: string) => void;
  isAdmin: boolean;
}>({
  effectiveRole: "",
  viewAsRole: "",
  setViewAsRole: () => {},
  isAdmin: false,
});

export function useEffectiveRole() {
  return useContext(EffectiveRoleContext);
}

export function EffectiveRoleProvider({
  children,
  effectiveRole,
  viewAsRole,
  setViewAsRole,
  isAdmin,
}: {
  children: ReactNode;
  effectiveRole: string;
  viewAsRole: string;
  setViewAsRole: (role: string) => void;
  isAdmin: boolean;
}) {
  return (
    <EffectiveRoleContext.Provider
      value={{ effectiveRole, viewAsRole, setViewAsRole, isAdmin }}
    >
      {children}
    </EffectiveRoleContext.Provider>
  );
}
