import React from "react";

export function renderDashboardPage(controlPanelNode: React.ReactNode, dataExplorerNode: React.ReactNode) {
  return (
    <main key="view-dashboard" className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
      {controlPanelNode}
      {dataExplorerNode}
    </main>
  );
}
