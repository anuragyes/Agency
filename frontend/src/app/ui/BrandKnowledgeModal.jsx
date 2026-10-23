// ─────────────────────────────────────────────────────────────
// BrandKnowledgeModal.jsx — Interactive Brand Brain (RAG) Manager
//
// Allows viewing, editing, and incrementally appending new context chunks
// without re-crawling or reprocessing the whole knowledge base.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import Icon from "./Icon";
import { Btn, Field, Modal, Pill, Segmented, Spinner, cx, useToast } from "./kit";
import {
  getProductKnowledge,
  updateProductKnowledge,
  addKnowledgeChunk,
  updateKnowledgeChunk,
  deleteKnowledgeChunk,
} from "../api";

const CATEGORY_META = {
  brand_overview: { label: "Overview & Mission", color: "#6366f1", bg: "#eef2ff" },
  products_catalog: { label: "Products & Pricing", color: "#10b981", bg: "#ecfdf5" },
  target_audience: { label: "Target Audience", color: "#f59e0b", bg: "#fffbeb" },
  value_props_usps: { label: "USPs & Benefits", color: "#8b5cf6", bg: "#f5f3ff" },
  brand_voice: { label: "Tone & Voice", color: "#ec4899", bg: "#fdf2f8" },
  general: { label: "General Knowledge", color: "#64748b", bg: "#f8fafc" },
};

export default function BrandKnowledgeModal({ open, onClose, productId, productName, onUpdated }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("chunks"); // "chunks" | "markdown"
  const [busy, setBusy] = useState("");

  // Edit/Add Chunk State
  const [addingChunk, setAddingChunk] = useState(false);
  const [newChunk, setNewChunk] = useState({ title: "", content: "", category: "products_catalog" });
  const [editingChunkId, setEditingChunkId] = useState(null);
  const [editChunkForm, setEditChunkForm] = useState({ title: "", content: "", category: "" });

  // Full Markdown Edit Mode
  const [editingMd, setEditingMd] = useState(false);
  const [markdownText, setMarkdownText] = useState("");

  const loadData = () => {
    if (!productId) return;
    setLoading(true);
    getProductKnowledge(productId)
      .then((res) => {
        setData(res);
        setMarkdownText(res?.knowledgeMd || "");
      })
      .catch((err) => toast(err.message, "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && productId) {
      loadData();
      setAddingChunk(false);
      setEditingChunkId(null);
      setEditingMd(false);
    }
  }, [open, productId]);

  if (!open) return null;

  const handleSaveNewChunk = async (e) => {
    e.preventDefault();
    if (!newChunk.title.trim() || !newChunk.content.trim()) {
      toast("Please provide both a title and content for the new context.", "error");
      return;
    }
    setBusy("add_chunk");
    try {
      await addKnowledgeChunk(productId, newChunk);
      toast(`Added "${newChunk.title}" to RAG Brand Brain!`, "success");
      setNewChunk({ title: "", content: "", category: "products_catalog" });
      setAddingChunk(false);
      loadData();
      if (onUpdated) onUpdated();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy("");
    }
  };

  const handleSaveEditChunk = async (chunkId) => {
    if (!editChunkForm.title.trim() || !editChunkForm.content.trim()) return;
    setBusy("edit_chunk");
    try {
      await updateKnowledgeChunk(productId, chunkId, editChunkForm);
      toast("Chunk updated successfully!", "success");
      setEditingChunkId(null);
      loadData();
      if (onUpdated) onUpdated();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy("");
    }
  };

  const handleDeleteChunk = async (chunkId, title) => {
    if (!window.confirm(`Delete the section "${title}" from the knowledge base?`)) return;
    setBusy("delete_chunk");
    try {
      await deleteKnowledgeChunk(productId, chunkId);
      toast(`Deleted "${title}"`, "success");
      loadData();
      if (onUpdated) onUpdated();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy("");
    }
  };

  const handleSaveFullMarkdown = async () => {
    setBusy("save_md");
    try {
      await updateProductKnowledge(productId, { knowledgeMd: markdownText });
      toast("Knowledge base updated & re-indexed into RAG chunks!", "success");
      setEditingMd(false);
      loadData();
      if (onUpdated) onUpdated();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy("");
    }
  };

  const chunks = data?.knowledgeChunks || [];

  return (
    <Modal
      title={
        <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
          <span>Brand Brain (RAG): {productName || data?.name || "Project Knowledge"}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: "#dcfce7",
              color: "#166534",
              padding: "2px 8px",
              borderRadius: 10,
            }}
          >
            {chunks.length} Chunks Active
          </span>
        </div>
      }
      open={open}
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 16 }}>
        {/* Top Info Strip */}
        <div className="row between wrap" style={{ gap: 10, padding: "10px 14px", background: "var(--sa-bg)", borderRadius: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="sa-dot online" />
            <span style={{ fontSize: 13.5 }}>
              <b>Project:</b> {data?.name}
            </span>
          </div>

          <div className="row wrap" style={{ gap: 10 }}>
            {data?.websiteUrl && (
              <a
                href={data.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="small row"
                style={{ color: "var(--sa-primary)", gap: 4, textDecoration: "none", fontWeight: 600 }}
              >
                <Icon name="globe" size={14} />
                {data.websiteUrl.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "chunks", label: `RAG Chunks (${chunks.length})` },
                { value: "markdown", label: "Full Markdown (.md)" },
              ]}
            />
          </div>
        </div>

        {loading ? (
          <div className="row center" style={{ padding: 40, gap: 10 }}>
            <Spinner size={22} />
            <span className="muted">Retrieving Brand Knowledge Base...</span>
          </div>
        ) : tab === "chunks" ? (
          /* ───────── CHUNKS VIEW (RAG BLOCKS) ───────── */
          <div style={{ display: "grid", gap: 14 }}>
            <div className="row between wrap" style={{ gap: 10 }}>
              <div>
                <b style={{ fontSize: 14, display: "block" }}>Semantic Knowledge Chunks</b>
                <span className="small muted">
                  When you generate a post, only the 1-2 chunks relevant to your prompt are retrieved.
                </span>
              </div>
              {!addingChunk && (
                <Btn
                  variant="primary"
                  size="sm"
                  icon="plus"
                  onClick={() => setAddingChunk(true)}
                >
                  Add New Context
                </Btn>
              )}
            </div>

            {/* Incremental Add Chunk Form */}
            {addingChunk && (
              <form
                onSubmit={handleSaveNewChunk}
                style={{
                  border: "1.5px solid var(--sa-primary)",
                  borderRadius: 14,
                  padding: 16,
                  background: "#fbfaff",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div className="row between">
                  <b style={{ fontSize: 14, color: "var(--sa-primary)" }}>+ Add New Knowledge to Project</b>
                  <Btn variant="ghost" size="sm" onClick={() => setAddingChunk(false)}>
                    Cancel
                  </Btn>
                </div>
                <div className="row wrap" style={{ gap: 12 }}>
                  <div style={{ flex: "2 1 200px" }}>
                    <Field label="Section / Topic Title" required>
                      <input
                        className="sa-input"
                        placeholder="e.g. Summer Discount Offer or New 5th Grade Curriculum"
                        value={newChunk.title}
                        onChange={(e) => setNewChunk((c) => ({ ...c, title: e.target.value }))}
                        required
                        autoFocus
                      />
                    </Field>
                  </div>
                  <div style={{ flex: "1 1 140px" }}>
                    <Field label="Category">
                      <select
                        className="sa-input"
                        value={newChunk.category}
                        onChange={(e) => setNewChunk((c) => ({ ...c, category: e.target.value }))}
                      >
                        <option value="products_catalog">Products & Pricing</option>
                        <option value="target_audience">Target Audience</option>
                        <option value="value_props_usps">USPs & Benefits</option>
                        <option value="brand_voice">Tone & Guidelines</option>
                        <option value="brand_overview">Overview & Mission</option>
                      </select>
                    </Field>
                  </div>
                </div>

                <Field label="Content & Knowledge Details" required hint="Add exact pricing, new features, or guidelines.">
                  <textarea
                    className="sa-input"
                    style={{ minHeight: 80, lineHeight: 1.5 }}
                    placeholder="e.g. Special festive promo: Use code FESTIVE20 for 20% off all robotics starter kits until Sunday."
                    value={newChunk.content}
                    onChange={(e) => setNewChunk((c) => ({ ...c, content: e.target.value }))}
                    required
                  />
                </Field>

                <div className="row end" style={{ gap: 8 }}>
                  <Btn variant="ghost" size="sm" onClick={() => setAddingChunk(false)}>
                    Cancel
                  </Btn>
                  <Btn type="submit" variant="primary" size="sm" icon="check" loading={busy === "add_chunk"}>
                    Save New Context
                  </Btn>
                </div>
              </form>
            )}

            {/* List of Chunks */}
            <div style={{ display: "grid", gap: 10, maxHeight: 380, overflowY: "auto", paddingRight: 4 }}>
              {chunks.length > 0 ? (
                chunks.map((c) => {
                  const isEditing = editingChunkId === c.chunkId;
                  const cat = CATEGORY_META[c.category] || CATEGORY_META.general;

                  if (isEditing) {
                    return (
                      <div
                        key={c.chunkId}
                        style={{
                          border: "1.5px solid var(--sa-primary)",
                          borderRadius: 14,
                          padding: 14,
                          background: "#fff",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div className="row wrap" style={{ gap: 8 }}>
                          <input
                            className="sa-input"
                            style={{ flex: 1, fontWeight: 700 }}
                            value={editChunkForm.title}
                            onChange={(e) => setEditChunkForm((f) => ({ ...f, title: e.target.value }))}
                          />
                          <select
                            className="sa-input"
                            style={{ width: 170 }}
                            value={editChunkForm.category}
                            onChange={(e) => setEditChunkForm((f) => ({ ...f, category: e.target.value }))}
                          >
                            <option value="products_catalog">Products & Pricing</option>
                            <option value="target_audience">Target Audience</option>
                            <option value="value_props_usps">USPs & Benefits</option>
                            <option value="brand_voice">Tone & Guidelines</option>
                            <option value="brand_overview">Overview & Mission</option>
                          </select>
                        </div>
                        <textarea
                          className="sa-input"
                          style={{ minHeight: 90, lineHeight: 1.5 }}
                          value={editChunkForm.content}
                          onChange={(e) => setEditChunkForm((f) => ({ ...f, content: e.target.value }))}
                        />
                        <div className="row end" style={{ gap: 8 }}>
                          <Btn size="sm" variant="ghost" onClick={() => setEditingChunkId(null)}>
                            Cancel
                          </Btn>
                          <Btn
                            size="sm"
                            variant="primary"
                            icon="check"
                            loading={busy === "edit_chunk"}
                            onClick={() => handleSaveEditChunk(c.chunkId)}
                          >
                            Save Changes
                          </Btn>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={c.chunkId}
                      style={{
                        border: "1px solid var(--sa-border)",
                        borderRadius: 14,
                        padding: "12px 14px",
                        background: "#ffffff",
                        display: "grid",
                        gap: 6,
                        transition: "border-color 0.15s ease",
                      }}
                    >
                      <div className="row between wrap" style={{ gap: 8 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: cat.color,
                              background: cat.bg,
                              padding: "2px 7px",
                              borderRadius: 6,
                            }}
                          >
                            {cat.label}
                          </span>
                          <b style={{ fontSize: 14 }}>{c.title}</b>
                        </div>
                        <div className="row" style={{ gap: 4 }}>
                          <button
                            type="button"
                            className="sa-iconbtn"
                            title="Edit this chunk"
                            style={{ width: 28, height: 28 }}
                            onClick={() => {
                              setEditingChunkId(c.chunkId);
                              setEditChunkForm({
                                title: c.title,
                                content: c.content,
                                category: c.category,
                              });
                            }}
                          >
                            <Icon name="pen" size={13} />
                          </button>
                          <button
                            type="button"
                            className="sa-iconbtn"
                            title="Delete this chunk"
                            style={{ width: 28, height: 28, color: "#ef4444" }}
                            onClick={() => handleDeleteChunk(c.chunkId, c.title)}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>

                      <p
                        className="small"
                        style={{
                          margin: "2px 0 0",
                          lineHeight: 1.5,
                          color: "var(--sa-ink)",
                          whiteSpace: "pre-line",
                        }}
                      >
                        {c.content}
                      </p>
                    </div>
                  );
                })
              ) : (
                <p className="muted small" style={{ margin: 0, padding: "20px 0", textAlign: "center" }}>
                  No knowledge chunks found. Click "+ Add New Context" above to create one.
                </p>
              )}
            </div>
          </div>
        ) : (
          /* ───────── FULL MARKDOWN VIEW ───────── */
          <div style={{ display: "grid", gap: 12 }}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <div>
                <b style={{ fontSize: 14, display: "block" }}>Full Brand Knowledge Markdown Document</b>
                <span className="small muted">
                  Editing here automatically re-chunks the knowledge base into RAG vectors.
                </span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {editingMd ? (
                  <>
                    <Btn size="sm" variant="ghost" onClick={() => setEditingMd(false)}>
                      Cancel
                    </Btn>
                    <Btn
                      size="sm"
                      variant="primary"
                      icon="check"
                      loading={busy === "save_md"}
                      onClick={handleSaveFullMarkdown}
                    >
                      Save & Re-Index
                    </Btn>
                  </>
                ) : (
                  <Btn size="sm" icon="pen" onClick={() => setEditingMd(true)}>
                    Edit Markdown
                  </Btn>
                )}
              </div>
            </div>

            {editingMd ? (
              <textarea
                className="sa-input"
                style={{
                  minHeight: 340,
                  fontFamily: "monospace",
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
                value={markdownText}
                onChange={(e) => setMarkdownText(e.target.value)}
              />
            ) : (
              <pre
                style={{
                  maxHeight: 340,
                  overflow: "auto",
                  background: "#181824",
                  color: "#e2e4f0",
                  padding: 16,
                  borderRadius: 14,
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "monospace",
                }}
              >
                {data?.knowledgeMd || "No custom knowledge markdown generated yet."}
              </pre>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="row between wrap" style={{ gap: 8, marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--sa-border)" }}>
          <span className="small muted">
            {chunks.length} discrete chunks indexed · High-precision RAG enabled
          </span>
          <div className="row" style={{ gap: 8 }}>
            <Btn
              icon="copy"
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(data?.knowledgeMd || "");
                toast("Knowledge Markdown copied to clipboard!", "success");
              }}
            >
              Copy Markdown
            </Btn>
            <Btn variant="primary" size="sm" onClick={onClose}>
              Done
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}
