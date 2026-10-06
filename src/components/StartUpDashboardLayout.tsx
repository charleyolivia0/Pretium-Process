import type { ReactNode } from "react";
import { cardWithAccentStyle } from "../theme";

export type StartUpDashboardLayoutProps = {
  startUpContent?: ReactNode;
  teamContent?: ReactNode;
  primeContractContent?: ReactNode;
  primeContractHeaderAction?: ReactNode;
  permitsContent?: ReactNode;
  permitsHeaderAction?: ReactNode;
  startupDocsContent?: ReactNode;
  startupDocsHeaderAction?: ReactNode;
  tradesContent?: ReactNode;
  tradesHeaderAction?: ReactNode;
  tradesMinHeight?: string;
  datesContent?: ReactNode;
  budgetContent?: ReactNode;
  budgetHeaderAction?: ReactNode;
};

const defaultStartUp = (
  <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
    Time
    <br />
    Site
    <br />
    Client
    <br />
    <br />
    Pre-Start
    <br />
    High-Risk Review
    <br />
    Site Conditions
  </p>
);

const spreadsheetShellStyle = {
  border: "1px solid var(--border-subtle)",
  borderRadius: "0.5rem",
  overflow: "hidden",
  fontSize: "0.8125rem",
};

const spreadsheetHeaderRowStyle = {
  display: "grid",
  gap: "0.5rem",
  padding: "0.45rem 0.6rem",
  backgroundColor: "var(--surface-panel)",
  borderBottom: "1px solid var(--border-subtle)",
  fontWeight: 600,
  color: "var(--text-primary)",
};

const defaultPrimeContract = (
  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
    Prime contract document
  </p>
);

const defaultPermits = (
  <div style={spreadsheetShellStyle}>
    <div style={{ ...spreadsheetHeaderRowStyle, gridTemplateColumns: "2fr 1fr 1fr" }}>
      <span>Permit</span>
      <span>Uploaded</span>
      <span>File</span>
    </div>
  </div>
);

const defaultTeam = (
  <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
    Project Manager
    <br />
    Project Coordinator
    <br />
    Site Super
    <br />
    Principal
    <br />
    Accounts payable
    <br />
    Safety
  </p>
);

const defaultStartupDocs = (
  <div style={spreadsheetShellStyle}>
    <div style={{ ...spreadsheetHeaderRowStyle, gridTemplateColumns: "1.2fr 1fr" }}>
      <span>Folder / type</span>
      <span>File</span>
    </div>
  </div>
);

const defaultTrades = (
  <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
    Priority list
    <br />
    Follow-ups
    <br />
    Team actions
  </p>
);

const defaultDates = (
  <>
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "0.5rem", padding: "0.5rem" }}>
      Start Date
    </div>
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "0.5rem", padding: "0.5rem" }}>
      End Date
    </div>
  </>
);

const sectionHeadingStyle = {
  margin: "0 0 0.75rem 0",
  fontSize: "1.125rem",
  fontWeight: 600,
  color: "var(--text-primary)",
};

const panelTitleStyle = {
  margin: 0,
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "var(--text-primary)",
};

function StartupWidgetSection({
  title,
  headerAction,
  children,
  minHeight,
}: {
  title: string;
  headerAction?: ReactNode;
  children: ReactNode;
  minHeight?: string;
}) {
  return (
    <section
      style={{
        ...cardWithAccentStyle,
        ...(minHeight !== undefined ? { minHeight } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <h3 style={panelTitleStyle}>{title}</h3>
        {headerAction ?? null}
      </div>
      <div style={{ marginTop: "0.75rem" }}>{children}</div>
    </section>
  );
}

/**
 * Grouped layout for the public Start Up landing page and per-project startup summary.
 * Overview and documents use fixed 3-column rows; budget and trades span full width below.
 */
export function StartUpDashboardLayout({
  startUpContent,
  teamContent,
  primeContractContent,
  primeContractHeaderAction,
  permitsContent,
  permitsHeaderAction,
  startupDocsContent,
  startupDocsHeaderAction,
  tradesContent,
  tradesHeaderAction,
  tradesMinHeight = "22rem",
  datesContent,
  budgetContent,
  budgetHeaderAction,
}: StartUpDashboardLayoutProps) {
  return (
    <>
      <style>{`
        .startup-summary-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .startup-summary-row {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 52rem) {
          .startup-summary-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div className="startup-summary-page">
        <section>
          <h2 className="section-header" style={sectionHeadingStyle}>
            Project overview
          </h2>
          <div className="startup-summary-row">
            <StartupWidgetSection title="Start Up" minHeight="12rem">
              {startUpContent ?? defaultStartUp}
            </StartupWidgetSection>
            <StartupWidgetSection title="Team" minHeight="12rem">
              {teamContent ?? defaultTeam}
            </StartupWidgetSection>
            <StartupWidgetSection title="Dates" minHeight="12rem">
              <div style={{ display: "grid", gap: "0.5rem", alignContent: "start" }}>
                {datesContent ?? defaultDates}
              </div>
            </StartupWidgetSection>
          </div>
        </section>

        <section>
          <h2 className="section-header" style={sectionHeadingStyle}>
            Documents
          </h2>
          <div className="startup-summary-row">
            <StartupWidgetSection title="Prime Contract" headerAction={primeContractHeaderAction} minHeight="14rem">
              {primeContractContent ?? defaultPrimeContract}
            </StartupWidgetSection>
            <StartupWidgetSection title="Permits" headerAction={permitsHeaderAction} minHeight="14rem">
              {permitsContent ?? defaultPermits}
            </StartupWidgetSection>
            <StartupWidgetSection title="Start up docs" headerAction={startupDocsHeaderAction} minHeight="14rem">
              {startupDocsContent ?? defaultStartupDocs}
            </StartupWidgetSection>
          </div>
        </section>

        <StartupWidgetSection title="Budget" headerAction={budgetHeaderAction} minHeight="10rem">
          {budgetContent ?? null}
        </StartupWidgetSection>

        <StartupWidgetSection title="Trades" headerAction={tradesHeaderAction} minHeight={tradesMinHeight}>
          {tradesContent ?? defaultTrades}
        </StartupWidgetSection>
      </div>
    </>
  );
}
