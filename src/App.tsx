import React from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppController } from "./hooks/useAppController";

export { ErrorBoundary };

export default function App() {
  const [
    adminGateNode,
    imageFileInputRef,
    handleUploadMarketingImages,
    headerNode,
    pageNode,
    sessionModalNode,
    modalsLayerNode,
  ] = useAppController();

  if (adminGateNode) {
    return adminGateNode;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      <input
        type="file"
        ref={imageFileInputRef}
        onChange={handleUploadMarketingImages}
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
      />
      {headerNode}
      {pageNode}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-sm text-slate-500">
        <p className="tracking-wide">CoinMarketCap Automated Community Bot Control Panel © 2026. All rights reserved.</p>
      </footer>
      {sessionModalNode}
      {modalsLayerNode}
    </div>
  );
}
