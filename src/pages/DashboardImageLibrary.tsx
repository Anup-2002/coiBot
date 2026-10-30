import React from "react";
import { Play, RefreshCw, ChevronRight, ChevronLeft, Trash2, Globe, Search, Filter, Maximize2, Pause, Upload, Image as ImageIcon, Shuffle, X, LayoutGrid, List } from "lucide-react";
import { resolveUrl } from "../utils/ui-helpers";
import { CustomSelect } from "../components/CustomSelect";
import { SafeImageDisplay } from "../components/SafeImageDisplay";

export function renderDashboardImageLibrary(isBusy: any, isPostingActive: any, isSchedulerRunning: any, imageUploadEnabled: any, marketingImages: any, imageSelectionMode: any, handleToggleImageUpload: any, isUpdatingImageSettings: any, imageFileInputRef: any, isUploadingImages: any, activeTab: any, isExternalImportModalOpen: any, setIsExternalImportModalOpen: any, setExternalImportStatus: any, handleClearAllMarketingImages: any, imageSearchQuery: any, setImageSearchQuery: any, imagePageSize: any, setImagePageSize: any, setImagePage: any, setPreviewModalImage: any, handleDeleteMarketingImage: any, externalImportLinks: any, setExternalImportLinks: any, externalImportReplace: any, setExternalImportReplace: any, externalImportStatus: any, isImportingExternal: any, handleImportExternalImages: any, previewModalImage: any, isContinuousLoopActive: any, activeImageIndex: any, replaceExistingOnUpload: any, setReplaceExistingOnUpload: any, uploadProgressText: any, handleSetImageMode: any, autoPruneEnabled: any, handleToggleAutoPrune: any, autoPruneLimit: any, handleManualPruneNow: any, isPruningImages: any, totalMarketingBytes: any, handleSelectAllImages: any, selectedImageFilenames: any, handleBatchDeleteSelectedImages: any, fetchMarketingImages: any, setImageViewMode: any, imageViewMode: any, filteredMarketingImages: any, currentPageClamped: any, totalImagePages: any, paginatedMarketingImages: any, handleToggleSelectImage: any, setSelectedImageFilenames: any) {
  return (
    <>
          {/* TAB 5: MARKETING IMAGES LIBRARY (STRICTLY 1 IMAGE PER COMMENT) */}
          {activeTab === "images" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* TOP HERO HEADER & MASTER TOGGLE */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-indigo-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shadow-sm">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white text-base">Marketing & Signals Image Library</h3>
                      <span className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded ${imageUploadEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                        {imageUploadEnabled ? `ACTIVE • 1 IMAGE PER COMMENT (${marketingImages.length} Ready)` : 'PAUSED • TEXT-ONLY MODE'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">
                      Attaches 1 promotional or chart graphic to every comment across Manual Posting, Continuous Loop, and Scheduler.
                    </p>
                  </div>
                </div>

                {/* Master Toggle (Dedicated Right Position) */}
                <button
                  onClick={() => handleToggleImageUpload()}
                  disabled={isUpdatingImageSettings}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 cursor-pointer shrink-0 border ${
                    imageUploadEnabled
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-600/30"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                  }`}
                >
                  {imageUploadEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  <span>{imageUploadEnabled ? "Pause Image Uploading" : "Enable Image Uploading"}</span>
                </button>
              </div>

              {/* ORDERED 2-STEP UPLOAD & CLOUD IMPORT CARDS (Un-stuffed, clear hierarchy) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Step 1: Upload from Computer */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-mono uppercase font-bold text-emerald-400">Step 1 • Local Files</span>
                    <h4 className="text-sm font-bold text-white">Upload Images from Computer</h4>
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-slate-200 pt-0.5">
                      <input
                        type="checkbox"
                        checked={replaceExistingOnUpload}
                        onChange={(e) => setReplaceExistingOnUpload(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                      <span>Replace existing library batch on upload</span>
                    </label>
                  </div>
                  <button
                    onClick={() => imageFileInputRef.current?.click()}
                    disabled={isUploadingImages}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20 disabled:opacity-50 shrink-0"
                    title="Upload images from your computer"
                  >
                    <Upload className="h-4 w-4" />
                    <span>{isUploadingImages ? (uploadProgressText || "Uploading...") : "Upload Images"}</span>
                  </button>
                </div>

                {/* Step 2: Import from Drive / S3 */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-mono uppercase font-bold text-teal-400">Step 2 • Cloud Sync</span>
                    <h4 className="text-sm font-bold text-white">Import from Google Drive or Web Link</h4>
                    <p className="text-xs text-slate-400">
                      Fetch daily chart packs directly from a shared Drive folder or image link.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsExternalImportModalOpen(true)}
                    className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-950/40 shrink-0"
                    title="Import images from Google Drive or web links"
                  >
                    <Globe className="h-4 w-4" />
                    <span>Import from Link</span>
                  </button>
                </div>
              </div>

              {/* ROTATION & RETENTION SETTINGS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Rotation Policy</span>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleSetImageMode("cycle")}
                      disabled={isUpdatingImageSettings}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold transition cursor-pointer ${
                        imageSelectionMode === "cycle"
                          ? "bg-indigo-600 text-white shadow"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Sequential Cycle
                    </button>
                    <button
                      onClick={() => handleSetImageMode("random")}
                      disabled={isUpdatingImageSettings}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold transition cursor-pointer ${
                        imageSelectionMode === "random"
                          ? "bg-indigo-600 text-white shadow"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Random Shuffle
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {imageSelectionMode === "cycle"
                      ? "Rotates through images 1 ➔ 2 ➔ 3 so consecutive comments never duplicate graphics."
                      : "Picks a random graphic from library for each coin submission."}
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Single Image Constraint</span>
                  <div className="text-base font-bold text-emerald-400 font-mono pt-1">Strictly 1 Image / Post</div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Enforces CoinMarketCap's community standard: exactly 1 graphic attached per comment.
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Daily Auto-Prune Policy</span>
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoPruneEnabled}
                        onChange={(e) => handleToggleAutoPrune(e.target.checked)}
                        className="w-3 h-3 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                      <span>{autoPruneEnabled ? "Auto-Delete ON" : "Retain All"}</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <CustomSelect
                      value={autoPruneLimit}
                      accent="indigo"
                      menuMinWidth={200}
                      className="text-slate-200 py-1.5 px-3"
                      title="Maximum number of recent images to keep"
                      options={[
                        { value: 10, label: "Keep latest 10 images" },
                        { value: 20, label: "Keep latest 20 images" },
                        { value: 30, label: "Keep latest 30 images" },
                        { value: 50, label: "Keep latest 50 images" },
                        { value: 100, label: "Keep latest 100 images" },
                      ]}
                      onChange={(val) => handleToggleAutoPrune(autoPruneEnabled, Number(val))}
                    />
                    {marketingImages.length > autoPruneLimit && (
                      <button
                        onClick={() => handleManualPruneNow(autoPruneLimit)}
                        disabled={isPruningImages}
                        className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-lg text-[11px] font-bold transition cursor-pointer shrink-0"
                        title="Prune excess older images right now"
                      >
                        Prune Now
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {autoPruneEnabled
                      ? `When daily images arrive, graphics older than the ${autoPruneLimit} newest are automatically deleted.`
                      : "Maintains all graphics until manually batch-deleted or replaced."}
                  </p>
                </div>
              </div>

              {/* SCALABLE MEDIA GALLERY TOOLBAR */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      SpikeSignals Image Library
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-mono">
                        {marketingImages.length} images ({((totalMarketingBytes / 1024) > 1024 ? (totalMarketingBytes / (1024 * 1024)).toFixed(1) + " MB" : (totalMarketingBytes / 1024).toFixed(0) + " KB")})
                      </span>
                    </h4>
                  </div>

                  {/* GALLERY SELECTION, SEARCH & VIEW SWITCHER */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Select All / Deselect All */}
                    {marketingImages.length > 0 && (
                      <button
                        onClick={handleSelectAllImages}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 text-sm font-semibold transition cursor-pointer"
                      >
                        {selectedImageFilenames.length === marketingImages.length
                          ? "Deselect All"
                          : `Select All (${marketingImages.length})`}
                      </button>
                    )}

                    {/* Batch Delete Selected button */}
                    {selectedImageFilenames.length > 0 && (
                      <button
                        onClick={handleBatchDeleteSelectedImages}
                        disabled={isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                        className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-all duration-150 active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shadow-sm"
                        title={(isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) ? "Locked while posting is active" : "Delete selected images"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Selected ({selectedImageFilenames.length})
                      </button>
                    )}

                    {marketingImages.length > 0 && (
                      <button
                        onClick={handleClearAllMarketingImages}
                        disabled={isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-slate-800 hover:border-red-500/30 text-sm font-bold transition-all duration-150 active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
                        title={(isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning) ? "Locked while posting is active" : "Remove all images"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear All
                      </button>
                    )}

                    <button
                      onClick={fetchMarketingImages}
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition cursor-pointer"
                      title="Reload images"
                      aria-label="Reload images"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={imageSearchQuery}
                        onChange={(e) => {
                          setImageSearchQuery(e.target.value);
                          setImagePage(1);
                        }}
                        placeholder="Filter by filename..."
                        className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44 sm:w-56"
                      />
                      {imageSearchQuery && (
                        <button
                          onClick={() => {
                            setImageSearchQuery("");
                            setImagePage(1);
                          }}
                          className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-sm cursor-pointer" title="Clear filter" aria-label="Clear filter">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* View Switcher: Grid vs List */}
                    <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setImageViewMode("grid")}
                        className={`p-1.5 rounded-md text-sm transition cursor-pointer ${
                          imageViewMode === "grid"
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Compact Grid View (High Density)"
                        aria-label="Compact Grid View"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setImageViewMode("list")}
                        className={`p-1.5 rounded-md text-sm transition cursor-pointer ${
                          imageViewMode === "list"
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="List Table View (Compact Rows)"
                        aria-label="List Table View"
                      >
                        <List className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Page Size Select */}
                    <CustomSelect
                      value={imagePageSize}
                      accent="indigo"
                      menuMinWidth={130}
                      className="text-slate-200 py-1.5 px-3"
                      title="Items per page"
                      options={[
                        { value: 12, label: "12 / page" },
                        { value: 24, label: "24 / page" },
                        { value: 48, label: "48 / page" },
                        { value: 96, label: "96 / page" },
                      ]}
                      onChange={(val) => {
                        setImagePageSize(Number(val));
                        setImagePage(1);
                      }}
                    />
                  </div>
                </div>

                {/* Sub-bar: showing pagination info */}
                {filteredMarketingImages.length > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-900 pt-2.5">
                    <span>
                      Showing {Math.min((currentPageClamped - 1) * imagePageSize + 1, filteredMarketingImages.length)} -{" "}
                      {Math.min(currentPageClamped * imagePageSize, filteredMarketingImages.length)} of{" "}
                      {filteredMarketingImages.length} {imageSearchQuery ? "matching images" : "images"}
                    </span>

                    {totalImagePages > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setImagePage((p) => Math.max(1, p - 1))}
                          disabled={currentPageClamped <= 1}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 rounded border border-slate-800 text-slate-300 text-[10px] flex items-center gap-0.5 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          Prev
                        </button>
                        <span className="font-mono text-slate-300 px-1.5">
                          {currentPageClamped} / {totalImagePages}
                        </span>
                        <button
                          onClick={() => setImagePage((p) => Math.min(totalImagePages, p + 1))}
                          disabled={currentPageClamped >= totalImagePages}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 rounded border border-slate-800 text-slate-300 text-[10px] flex items-center gap-0.5 cursor-pointer disabled:cursor-not-allowed"
                        >
                          Next
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* IMAGE GALLERY VIEW CONTAINER */}
              <div>
                {filteredMarketingImages.length === 0 ? (
                  marketingImages.length === 0 ? (
                    <div
                      onClick={() => imageFileInputRef.current?.click()}
                      className="bg-slate-950/60 p-12 text-center rounded-2xl border-2 border-dashed border-slate-800 hover:border-indigo-500/50 transition cursor-pointer space-y-3"
                    >
                      <Upload className="h-10 w-10 text-indigo-400 mx-auto" />
                      <p className="text-base text-slate-300 font-semibold">No images currently in library</p>
                      <p className="text-sm text-slate-500 max-w-md mx-auto">
                        Click here to upload your 5 SpikeSignals infographics (PNG/JPG). In the future, daily images from an S3 bucket or API can be dropped here as well.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-slate-950 p-8 text-center rounded-2xl border border-slate-800 text-slate-400 text-sm">
                      No graphics found matching "{imageSearchQuery}". Try a different filter term.
                    </div>
                  )
                ) : imageViewMode === "grid" ? (
                  /* COMPACT HIGH-DENSITY GRID (Optimized for 50-200+ images) */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {paginatedMarketingImages.map((img) => {
                      const overallIndex = marketingImages.findIndex((m) => m.filename === img.filename);
                      const isNext =
                        imageSelectionMode === "cycle" &&
                        marketingImages.length > 0 &&
                        activeImageIndex % marketingImages.length === overallIndex;

                      return (
                        <div
                          key={img.filename}
                          className={`bg-slate-950 rounded-xl border overflow-hidden flex flex-col justify-between transition-all duration-150 group relative hover:border-indigo-500/70 hover:shadow-lg ${
                            isNext
                              ? "border-indigo-500 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500"
                              : "border-slate-800"
                          }`}
                        >
                          {/* Compact Thumbnail Frame */}
                          <div
                            onClick={() => setPreviewModalImage(img)}
                            className="aspect-square bg-slate-900 relative overflow-hidden cursor-pointer"
                          >
                            <SafeImageDisplay
                              src={resolveUrl(img.url)}
                              fallbackSrc={resolveUrl(`/output/marketing_images/${encodeURIComponent(img.filename)}`)}
                              alt={img.filename}
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />

                            {/* Checkbox & Status badges */}
                            <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedImageFilenames.includes(img.filename)}
                                onChange={() => handleToggleSelectImage(img.filename)}
                                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900/90 text-indigo-600 focus:ring-0 cursor-pointer shadow"
                              />
                              {isNext && (
                                <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                  NEXT
                                </span>
                              )}
                            </div>

                            <div className="absolute top-1.5 right-1.5 bg-slate-950/80 backdrop-blur-sm text-slate-300 text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-800">
                              #{overallIndex + 1}
                            </div>

                            {/* Hover Quick Actions Overlay */}
                            <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewModalImage(img);
                                }}
                                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow cursor-pointer"
                                title="Expand Preview"
                                aria-label="Expand Preview"
                              >
                                <Maximize2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMarketingImage(img.filename);
                                }}
                                className="p-2 bg-slate-800 hover:bg-red-500 text-slate-300 hover:text-white rounded-lg shadow cursor-pointer"
                                title="Delete image"
                                aria-label="Delete image"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Compact File Info */}
                          <div className="p-2 border-t border-slate-900 bg-slate-950/90">
                            <h5
                              className="font-medium text-white text-[11px] truncate cursor-pointer hover:text-indigo-300"
                              title={img.filename}
                              onClick={() => setPreviewModalImage(img)}
                            >
                              {img.filename}
                            </h5>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                              <span>{(img.sizeBytes / 1024).toFixed(0)} KB</span>
                              <span className="text-[9px] text-slate-600">
                                {img.updatedAt ? new Date(img.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* COMPACT LIST TABLE VIEW (Ultra-compact for 100+ images) */
                  <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3 w-16 text-center">
                              <input
                                type="checkbox"
                                checked={
                                  paginatedMarketingImages.length > 0 &&
                                  paginatedMarketingImages.every((img) => selectedImageFilenames.includes(img.filename))
                                }
                                onChange={() => {
                                  const pageFilenames = paginatedMarketingImages.map((img) => img.filename);
                                  const allSelected = pageFilenames.every((f) => selectedImageFilenames.includes(f));
                                  if (allSelected) {
                                    setSelectedImageFilenames((prev) => prev.filter((f) => !pageFilenames.includes(f)));
                                  } else {
                                    setSelectedImageFilenames((prev) => Array.from(new Set([...prev, ...pageFilenames])));
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                                title="Select / Deselect all on this page"
                              />
                            </th>
                            <th className="py-2.5 px-3 w-16">Preview</th>
                            <th className="py-2.5 px-3">Filename</th>
                            <th className="py-2.5 px-3 w-24">Size</th>
                            <th className="py-2.5 px-3 w-28">Date Added</th>
                            <th className="py-2.5 px-3 w-32">Queue Status</th>
                            <th className="py-2.5 px-3 w-20 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900 text-slate-300 font-mono">
                          {paginatedMarketingImages.map((img) => {
                            const overallIndex = marketingImages.findIndex((m) => m.filename === img.filename);
                            const isNext =
                              imageSelectionMode === "cycle" &&
                              marketingImages.length > 0 &&
                              activeImageIndex % marketingImages.length === overallIndex;

                            return (
                              <tr
                                key={img.filename}
                                className="hover:bg-slate-900/50 transition cursor-pointer"
                                onClick={() => setPreviewModalImage(img)}
                              >
                                <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={selectedImageFilenames.includes(img.filename)}
                                      onChange={() => handleToggleSelectImage(img.filename)}
                                      className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                                    />
                                    <span>#{overallIndex + 1}</span>
                                  </div>
                                </td>
                                <td className="py-1.5 px-3">
                                  <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0">
                                    <SafeImageDisplay
                                      src={resolveUrl(img.url)}
                                      fallbackSrc={resolveUrl(`/output/marketing_images/${encodeURIComponent(img.filename)}`)}
                                      alt={img.filename}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <span className="font-semibold text-white hover:text-indigo-300 transition text-sm block truncate max-w-xs sm:max-w-md">
                                    {img.filename}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-400 text-[11px]">
                                  {(img.sizeBytes / 1024).toFixed(1)} KB
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-[11px]">
                                  {img.updatedAt ? new Date(img.updatedAt).toLocaleDateString() : "—"}
                                </td>
                                <td className="py-2 px-3">
                                  {isNext ? (
                                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                                      NEXT IN LINE
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-600">In pool</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => setPreviewModalImage(img)}
                                      className="p-1 hover:text-indigo-400 text-slate-400 transition cursor-pointer"
                                      title="Preview"
                                      aria-label="Preview"
                                    >
                                      <Maximize2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMarketingImage(img.filename)}
                                      className="p-1 hover:text-red-400 text-slate-500 transition cursor-pointer"
                                      title="Delete"
                                      aria-label="Delete"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* BOTTOM PAGINATION BAR */}
                {totalImagePages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-900 text-sm text-slate-400">
                    <div>
                      Page <span className="text-white font-bold">{currentPageClamped}</span> of{" "}
                      <span className="text-white font-bold">{totalImagePages}</span> ({filteredMarketingImages.length} items total)
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setImagePage(1)}
                        disabled={currentPageClamped <= 1}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 font-mono text-sm border border-slate-800 cursor-pointer disabled:cursor-not-allowed"
                      >
                        « First
                      </button>
                      <button
                        onClick={() => setImagePage((p) => Math.max(1, p - 1))}
                        disabled={currentPageClamped <= 1}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 text-sm border border-slate-800 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <ChevronLeft className="h-3 w-3" />
                        Prev
                      </button>

                      {/* Numeric page pills */}
                      {Array.from({ length: Math.min(5, totalImagePages) }, (_, i) => {
                        let pageNum = i + 1;
                        if (totalImagePages > 5) {
                          if (currentPageClamped > 3 && currentPageClamped < totalImagePages - 1) {
                            pageNum = currentPageClamped - 2 + i;
                          } else if (currentPageClamped >= totalImagePages - 1) {
                            pageNum = totalImagePages - 4 + i;
                          }
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setImagePage(pageNum)}
                            className={`w-7 h-7 rounded-lg text-sm font-mono font-bold transition cursor-pointer ${
                              currentPageClamped === pageNum
                                ? "bg-indigo-600 text-white shadow"
                                : "bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800"
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setImagePage((p) => Math.min(totalImagePages, p + 1))}
                        disabled={currentPageClamped >= totalImagePages}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 text-sm border border-slate-800 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        Next
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setImagePage(totalImagePages)}
                        disabled={currentPageClamped >= totalImagePages}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 font-mono text-sm border border-slate-800 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Last »
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
              {/* EXTERNAL IMAGES IMPORT MODAL (Google Drive, S3, Web URLs) */}
              {isExternalImportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                          <Upload className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="text-base font-bold text-white">Import from Google Drive / S3 / Cloud URLs</h3>
                          <p className="text-sm text-slate-400">Paste shared Google Drive links, S3 bucket URLs, or image web links</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setIsExternalImportModalOpen(false);
                          setExternalImportStatus(null);
                        }}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                        title="Close modal"
                        aria-label="Close modal"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1.5">
                          Cloud Link or Image URLs (One per line or comma-separated)
                        </label>
                        <textarea
                          value={externalImportLinks}
                          onChange={(e) => setExternalImportLinks(e.target.value)}
                          placeholder={`Google Drive Folder: https://drive.google.com/drive/folders/1ABC...
Google Drive File: https://drive.google.com/file/d/1XYZ...
S3 Bucket / Image URLs:
https://my-bucket.s3.amazonaws.com/promo1.png
https://my-bucket.s3.amazonaws.com/promo2.jpg`}
                          rows={5}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Tip: For Google Drive folders, ensure the folder sharing link is set to "Anyone with the link can view".
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="modalReplaceExisting"
                          checked={externalImportReplace}
                          onChange={(e) => setExternalImportReplace(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-0 cursor-pointer accent-emerald-600"
                        />
                        <label htmlFor="modalReplaceExisting" className="text-sm text-slate-300 font-medium cursor-pointer select-none">
                          Replace existing images with this new imported batch
                        </label>
                      </div>

                      {externalImportStatus && (
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-300 font-mono">
                          {externalImportStatus}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setIsExternalImportModalOpen(false);
                            setExternalImportStatus(null);
                          }}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isImportingExternal || !externalImportLinks.trim()}
                          onClick={handleImportExternalImages}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer"
                        >
                          {isImportingExternal ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Importing Images...
                            </>
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5" />
                              Start Cloud Import
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FULL LIGHTBOX PREVIEW MODAL */}
              {previewModalImage && (
                <div
                  className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
                  onClick={() => setPreviewModalImage(null)}
                >
                  <div
                    className="bg-slate-950 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Modal Top Bar */}
                    <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <ImageIcon className="h-4 w-4 text-indigo-400 shrink-0" />
                        <h4 className="text-sm font-bold text-white truncate font-mono">
                          {previewModalImage.filename}
                        </h4>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          ({(previewModalImage.sizeBytes / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        onClick={() => setPreviewModalImage(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                        title="Close preview"
                        aria-label="Close preview"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Image Viewport with Next/Prev Arrows */}
                    <div className="flex-1 bg-black/50 p-4 flex items-center justify-center overflow-auto max-h-[70vh] relative group">
                      {marketingImages.length > 1 && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const idx = marketingImages.findIndex((m) => m.filename === previewModalImage.filename);
                              const prevIdx = (idx - 1 + marketingImages.length) % marketingImages.length;
                              setPreviewModalImage(marketingImages[prevIdx]);
                            }}
                            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700/80 shadow-xl transition cursor-pointer z-20 opacity-70 group-hover:opacity-100"
                            title="Previous Image (← Left Arrow)"
                            aria-label="Previous Image"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const idx = marketingImages.findIndex((m) => m.filename === previewModalImage.filename);
                              const nextIdx = (idx + 1) % marketingImages.length;
                              setPreviewModalImage(marketingImages[nextIdx]);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700/80 shadow-xl transition cursor-pointer z-20 opacity-70 group-hover:opacity-100"
                            title="Next Image (→ Right Arrow)"
                            aria-label="Next Image"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      <SafeImageDisplay
                        src={resolveUrl(previewModalImage.url)}
                        fallbackSrc={resolveUrl(`/output/marketing_images/${encodeURIComponent(previewModalImage.filename)}`)}
                        alt={previewModalImage.filename}
                        className="max-h-[66vh] max-w-full object-contain rounded-lg shadow-lg border border-slate-900"
                      />
                    </div>

                    {/* Modal Bottom Actions Bar */}
                    <div className="p-3.5 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold">
                          #{marketingImages.findIndex((m) => m.filename === previewModalImage.filename) + 1} of {marketingImages.length}
                        </span>
                        <span className="hidden sm:inline text-slate-500">
                          (Use ← / → keys to flip, Esc to close)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            handleDeleteMarketingImage(previewModalImage.filename);
                            setPreviewModalImage(null);
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 text-sm font-medium transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete Image
                        </button>
                        <button
                          onClick={() => setPreviewModalImage(null)}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
    </>
  );
}
