import { GameStateWidget } from "@/components/dashboard/game-state-widget";
import { RiskAssessmentWidget } from "@/components/dashboard/risk-assessment-widget";
import { SignalPanelWidget } from "@/components/dashboard/signal-panel-widget";
import { ChartWidget } from "@/components/dashboard/chart-widget";
import { AnalyticsPanelWidget } from "@/components/dashboard/analytics-panel-widget";
import { PatternRecognitionWidget } from "@/components/dashboard/pattern-recognition-widget";
import { DebugWidget } from "@/components/dashboard/debug-widget";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-primary">Majick Karpet Analytics Dashboard</h1>
        <p className="text-muted-foreground">Real-time insights into game dynamics.</p>
      </header>

      <main className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
        {/* Row 1 */}
        <div className="lg:col-span-4 md:col-span-6 col-span-12">
          <GameStateWidget />
        </div>
        <div className="lg:col-span-4 md:col-span-6 col-span-12">
          <RiskAssessmentWidget />
        </div>
        <div className="lg:col-span-4 md:col-span-12 col-span-12"> {/* Full width on medium if 3rd item */}
          <SignalPanelWidget />
        </div>

        {/* Row 2 */}
        <div className="col-span-12">
          <ChartWidget />
        </div>

        {/* Row 3 */}
        <div className="lg:col-span-6 col-span-12">
          <AnalyticsPanelWidget />
        </div>
        <div className="lg:col-span-6 col-span-12">
          <PatternRecognitionWidget />
        </div>
        
        {/* Row 4 */}
        <div className="col-span-12">
          <DebugWidget />
        </div>
      </main>
      
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Majick Karpet Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
