import { useState } from "react";
import { PillButton, SectionCard } from "../ui";
import { DEMO_GUIDE_STEPS } from "./demoGuideSteps";
import { dismissDemoGuide, isDemoGuideDismissed } from "./identity";
import "./demoGuide.css";

export function DemoGuideCard({ code }: { code: string }) {
  const [dismissed, setDismissed] = useState(() => isDemoGuideDismissed(code));

  if (dismissed) return null;

  function dismiss() {
    dismissDemoGuide(code);
    setDismissed(true);
  }

  return (
    <div className="pp-demo-guide">
      <SectionCard
        title="Demo guide"
        actions={
          <PillButton variant="ghost" size="sm" icon="x" onClick={dismiss}>
            Dismiss
          </PillButton>
        }
      >
        <ol className="pp-demo-guide-list">
          {DEMO_GUIDE_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}
