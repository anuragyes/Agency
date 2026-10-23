// ─────────────────────────────────────────────────────────────
// ProjectSelectorHub.jsx — High-End Modern Project Switcher & Hub
// Displays all user projects with avatar, website, post counts, and active state.
// ─────────────────────────────────────────────────────────────
import React from "react";
import Icon from "./Icon";
import { Btn, Pill, cx, gradientFor } from "./kit";

export default function ProjectSelectorHub({
  current,
  products = [],
  onSelect,
  onNewProject,
  title = "Project Workspaces",
  subtitle = "Each project has its own dedicated calendar, scheduled posts, and brand knowledge base.",
  actionText = "+ New Project",
  className = "",
  style = {},
}) {
  const currentId = current?._id;

  const getCleanDomain = (url) => {
    if (!url) return "";
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      return u.hostname.replace(/^www\./, "");
    } catch {
      return url.replace(/^https?:\/\//, "").split("/")[0];
    }
  };

  const getInitials = (name) => {
    if (!name) return "P";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div
      className={cx("sa-project-hub", className)}
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #fafafc 100%)",
        border: "1px solid var(--sa-border)",
        borderRadius: 20,
        padding: "20px 22px",
        boxShadow: "0 4px 20px -2px rgba(16, 24, 40, 0.04)",
        display: "grid",
        gap: 16,
        marginBottom: 24,
        ...style,
      }}
    >
      {/* Hub Top Bar */}
      <div className="row between wrap" style={{ gap: 12 }}>
        <div style={{ display: "grid", gap: 3 }}>
          <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "var(--sa-primary-50)",
                display: "grid",
                placeItems: "center",
                color: "var(--sa-primary)",
              }}
            >
              <Icon name="layers" size={17} />
            </span>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>
              {title}
            </h3>
            {current && (
              <span
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: "var(--sa-primary-50)",
                  color: "var(--sa-primary)",
                  fontWeight: 600,
                  border: "1px solid rgba(91, 76, 246, 0.2)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <i className="sa-dot online" style={{ width: 6, height: 6 }} />
                Active: <b>{current.aiProfile?.name || current.name || "Selected"}</b>
              </span>
            )}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {subtitle}
          </p>
        </div>

        {onNewProject && (
          <Btn
            variant="grad"
            size="sm"
            icon="plus"
            onClick={onNewProject}
            style={{ fontWeight: 600, boxShadow: "0 2px 8px rgba(91, 76, 246, 0.25)" }}
          >
            {actionText}
          </Btn>
        )}
      </div>

      {/* Interactive Project Cards Grid / Scroller */}
      <div
        className="sa-projects-row"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        {products.map((p) => {
          const isSelected = p._id === currentId;
          const brandName = p.aiProfile?.name || p.name || p.rawInput?.slice(0, 24) || "Untitled Project";
          const category = p.aiProfile?.category || p.category || "";
          const domain = getCleanDomain(p.websiteUrl);
          const postCount = p.postCount || 0;
          const scheduledCount = p.scheduledCount || 0;
          const publishedCount = p.publishedCount || 0;

          return (
            <div
              key={p._id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect && onSelect(p._id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect && onSelect(p._id);
                }
              }}
              style={{
                borderRadius: 16,
                padding: "16px 18px",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 14,
                position: "relative",
                transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
                border: isSelected
                  ? "2px solid var(--sa-primary)"
                  : "1px solid var(--sa-border)",
                background: isSelected
                  ? "linear-gradient(135deg, #ffffff 0%, #f6f4fe 100%)"
                  : "#ffffff",
                boxShadow: isSelected
                  ? "0 8px 24px -4px rgba(91, 76, 246, 0.18), 0 0 0 1px var(--sa-primary)"
                  : "0 2px 8px rgba(0, 0, 0, 0.02)",
                transform: isSelected ? "translateY(-1px)" : "none",
              }}
              className="sa-proj-card"
            >
              {/* Card Header: Avatar + Active Pill */}
              <div className="row between" style={{ alignItems: "flex-start", gap: 10 }}>
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  {p.logoUrl ? (
                    <img
                      src={p.logoUrl}
                      alt={brandName}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        objectFit: "contain",
                        border: "1px solid var(--sa-border)",
                        background: "#fff",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: gradientFor(brandName),
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        fontSize: 16,
                        flexShrink: 0,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                      }}
                    >
                      {getInitials(brandName)}
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <b
                      style={{
                        fontSize: 15,
                        display: "block",
                        color: "var(--sa-ink)",
                        letterSpacing: "-0.01em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={brandName}
                    >
                      {brandName}
                    </b>
                    {category ? (
                      <span className="small muted ellipsis" style={{ display: "block", fontSize: 12 }}>
                        {category}
                      </span>
                    ) : (
                      <span className="small muted" style={{ fontSize: 12 }}>
                        Project Workspace
                      </span>
                    )}
                  </div>
                </div>

                {isSelected ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: "var(--sa-primary)",
                      color: "#fff",
                      borderRadius: 12,
                      padding: "3px 8px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      flexShrink: 0,
                      boxShadow: "0 2px 6px rgba(91, 76, 246, 0.35)",
                    }}
                  >
                    <Icon name="check" size={11} stroke={3} />
                    Active
                  </span>
                ) : (
                  <span
                    className="sa-chip"
                    style={{
                      fontSize: 11,
                      height: 24,
                      padding: "0 8px",
                      background: "var(--sa-bg)",
                      border: "1px solid var(--sa-border)",
                      color: "var(--sa-ink-muted)",
                      flexShrink: 0,
                    }}
                  >
                    Select
                  </span>
                )}
              </div>

              {/* Card Meta: Website Pill */}
              {domain ? (
                <div className="row" style={{ gap: 6, fontSize: 12, color: "var(--sa-primary)" }}>
                  <Icon name="globe" size={13} />
                  <span
                    style={{
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {domain}
                  </span>
                  {p.knowledgeMd && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10.5,
                        background: "#dcfce7",
                        color: "#166534",
                        padding: "1px 6px",
                        borderRadius: 6,
                        fontWeight: 600,
                      }}
                    >
                      RAG Synced
                    </span>
                  )}
                </div>
              ) : (
                <div className="row" style={{ gap: 6, fontSize: 12, color: "var(--sa-ink-muted)" }}>
                  <Icon name="calendar" size={13} />
                  <span>Custom Project Schedule</span>
                </div>
              )}

              {/* Card Foot: Post Stats Counter */}
              <div
                style={{
                  paddingTop: 10,
                  borderTop: isSelected ? "1px solid rgba(91, 76, 246, 0.15)" : "1px solid var(--sa-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 12,
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <span
                    style={{
                      background: postCount > 0 ? "rgba(91, 76, 246, 0.08)" : "var(--sa-bg)",
                      color: postCount > 0 ? "var(--sa-primary)" : "var(--sa-ink-muted)",
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: 6,
                    }}
                  >
                    {postCount} {postCount === 1 ? "Post" : "Posts"}
                  </span>
                  {scheduledCount > 0 && (
                    <span
                      style={{
                        background: "rgba(245, 158, 11, 0.1)",
                        color: "#b45309",
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: 6,
                      }}
                    >
                      {scheduledCount} Scheduled
                    </span>
                  )}
                </div>

                {publishedCount > 0 && (
                  <span style={{ color: "#10b981", fontWeight: 600 }}>
                    {publishedCount} Live
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Quick Add Project Card */}
        {onNewProject && (
          <button
            type="button"
            onClick={onNewProject}
            style={{
              borderRadius: 16,
              padding: "18px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: "2px dashed var(--sa-border)",
              background: "rgba(255, 255, 255, 0.6)",
              minHeight: 140,
              transition: "all 0.18s ease",
            }}
            className="sa-add-proj-btn"
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--sa-primary-50)",
                color: "var(--sa-primary)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Icon name="plus" size={20} />
            </span>
            <b style={{ fontSize: 14, color: "var(--sa-ink)" }}>Add New Project</b>
            <span className="small muted" style={{ fontSize: 11.5, textAlign: "center" }}>
              Crawl website & generate dedicated calendar
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
