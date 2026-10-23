// ─────────────────────────────────────────────────────────────
// CreateProjectModal.jsx — "Make Your Project" Modal
// Crawls website, extracts catalog & tone, builds RAG Markdown knowledge base
// ─────────────────────────────────────────────────────────────
import React, { useState } from "react";
import Icon from "./Icon";
import { Btn, Field, Modal, useToast } from "./kit";
import { createProject } from "../api";
import { useWorkspace } from "../store";

export default function CreateProjectModal({ open, onClose, onCreated }) {
  const { addProduct, selectProduct, refreshProducts } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    description: "",
    websiteUrl: "",
    loading: false,
    error: "",
  });

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast("Please enter a project / brand name.", "error");
      return;
    }
    setForm((f) => ({ ...f, loading: true, error: "" }));

    try {
      const created = await createProject({
        name: form.name.trim(),
        description: form.description.trim(),
        websiteUrl: form.websiteUrl.trim(),
      });

      await refreshProducts();
      addProduct(created);
      selectProduct(created._id);

      setForm({ name: "", description: "", websiteUrl: "", loading: false, error: "" });
      toast(
        form.websiteUrl.trim()
          ? `Project "${created.name || form.name}" created! Website crawled & Brand Knowledge Base generated.`
          : `Project "${created.name || form.name}" created successfully!`,
        "success"
      );
      if (onCreated) onCreated(created);
      onClose();
    } catch (err) {
      setForm((f) => ({ ...f, loading: false, error: err.message || "Failed to create project" }));
      toast(err.message, "error");
    }
  };

  return (
    <Modal
      title="Make Your Project"
      open={open}
      onClose={() => !form.loading && onClose()}
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
        <p className="lead" style={{ margin: 0 }}>
          Enter your project name, product details, and website URL. Our AI analyzes your site to discover your products,
          pricing, and brand voice into a dedicated Markdown knowledge base (RAG) for hyper-relevant posts and calendar scheduling.
        </p>

        <Field label="Project / Brand Name" required>
          <input
            className="sa-input"
            placeholder="e.g. iLearnPlace, Kaveri Organics, or Northbeam"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            autoFocus
            disabled={form.loading}
          />
        </Field>

        <Field label="Product Details & Description" required hint="What does your project offer? Target audience? Key benefits?">
          <textarea
            className="sa-input"
            style={{ minHeight: 90, lineHeight: 1.5, resize: "vertical" }}
            placeholder="e.g. Interactive math adventure games and learning tools for elementary students. Fun, engaging, and builds confidence in learning."
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            required
            disabled={form.loading}
          />
        </Field>

        <Field
          label="Project Website Link (Optional)"
          hint="Our AI crawls your website to extract your product catalog, tone of voice, and offerings into an automated RAG Brain."
        >
          <div className="row" style={{ gap: 8 }}>
            <input
              className="sa-input"
              type="url"
              placeholder="https://ilearnplace.com"
              value={form.websiteUrl}
              onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              disabled={form.loading}
            />
          </div>
        </Field>

        {/* Informational feature card */}
        <div style={{ background: "var(--sa-primary-50)", padding: "12px 16px", borderRadius: 14, border: "1px solid #ebe6fb" }}>
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <Icon name="sparkles" size={18} style={{ color: "var(--sa-primary)", marginTop: 2, flexShrink: 0 }} />
            <span className="small" style={{ lineHeight: 1.5, color: "var(--sa-ink)" }}>
              <b>Dedicated Project Brain & Calendar:</b> Every project has its own separate calendar, scheduled posts,
              and AI knowledge base. When you switch projects, your workspace instantly updates.
            </span>
          </div>
        </div>

        {form.error && (
          <div className="sa-banner tone-red small" style={{ padding: 10 }}>
            <Icon name="alert" />
            <span>{form.error}</span>
          </div>
        )}

        <div className="row end" style={{ gap: 10, marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose} disabled={form.loading}>
            Cancel
          </Btn>
          <Btn
            type="submit"
            variant="grad"
            icon="sparkles"
            loading={form.loading}
          >
            {form.loading ? "Crawling & Building Brain…" : "Create Project & Build Brain"}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
