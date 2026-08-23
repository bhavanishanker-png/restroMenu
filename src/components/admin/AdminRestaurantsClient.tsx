"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Restaurant } from "@/types";

type Props = { initialRestaurants: Restaurant[] };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AdminRestaurantsClient({ initialRestaurants }: Props) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(initialRestaurants);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    phone: "",
    address: "",
  });

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((p) => {
      const updated = { ...p, [key]: value };
      if (key === "name" && p.slug === slugify(p.name)) {
        updated.slug = slugify(value);
      }
      return updated;
    });
  }

  async function create() {
    if (!form.name || !form.slug || !form.ownerName || !form.ownerEmail || !form.ownerPassword) {
      toast.error("All required fields must be filled.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerPassword: form.ownerPassword,
          phone: form.phone || null,
          address: form.address || null,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error: { message: string } };
        toast.error(error?.message ?? "Failed to create restaurant.");
        return;
      }
      const { restaurant } = (await res.json()) as { restaurant: Restaurant };
      setRestaurants((p) => [restaurant, ...p]);
      setForm({
        name: "",
        slug: "",
        ownerName: "",
        ownerEmail: "",
        ownerPassword: "",
        phone: "",
        address: "",
      });
      setOpen(false);
      toast.success(`${restaurant.name} created.`);
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = search.trim()
    ? restaurants.filter((r) =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.slug.toLowerCase().includes(search.toLowerCase())
      )
    : restaurants;

  return (
    <div className="flex flex-col gap-lg p-margin-mobile md:p-margin-desktop">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="relative w-full sm:w-96 sm:order-1">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by restaurant name or slug…"
            className="w-full pl-12 pr-4 h-12 bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-on-surface"
          />
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-lg font-label-bold text-label-bold shadow-level-1 hover:bg-primary-container hover:-translate-y-[2px] transition-all h-12 whitespace-nowrap sm:order-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          New Restaurant
        </button>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-level-1 border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant font-label-bold text-label-bold text-on-surface-variant">
                <th className="py-4 px-6">Name</th>
                <th className="py-4 px-6">Slug</th>
                <th className="py-4 px-6 hidden sm:table-cell">Plan</th>
                <th className="py-4 px-6 hidden md:table-cell">Created</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-24 text-center font-body-md text-on-surface-variant">
                    <span className="material-symbols-outlined block mx-auto mb-2" style={{ fontSize: 40 }}>
                      restaurant
                    </span>
                    {search ? "No matching restaurants." : "No restaurants yet."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-outline-variant/50 last:border-0 hover:bg-surface-container-lowest transition-colors ${
                    !r.isActive ? "opacity-60" : ""
                  }`}
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary font-headline-sm shrink-0">
                        {r.name.trim()[0]?.toUpperCase()}
                      </div>
                      <span className="font-headline-sm text-headline-sm" style={{ fontSize: 16 }}>
                        {r.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-on-surface-variant font-mono text-sm">
                    /{r.slug}
                  </td>
                  <td className="py-4 px-6 hidden sm:table-cell text-on-surface-variant capitalize">
                    {r.plan}
                  </td>
                  <td className="py-4 px-6 hidden md:table-cell text-on-surface-variant">
                    {fmtDate(r.createdAt)}
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-md font-label-bold text-[10px] ${
                        r.isActive
                          ? "bg-secondary-container text-on-secondary-container"
                          : "bg-error-container text-on-error-container"
                      }`}
                    >
                      {r.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <a
                      href={`/r/${r.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-10 h-10 rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
                      aria-label={`Open ${r.name}`}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>open_in_new</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="bg-surface-container-low px-6 py-4 flex justify-between items-center border-t border-outline-variant">
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Showing {filtered.length} of {restaurants.length} restaurant
            {restaurants.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Create restaurant sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md bg-surface-container-lowest border-l border-outline-variant">
          <SheetHeader className="border-b border-outline-variant/30 pb-sm mb-md">
            <SheetTitle className="font-headline-sm text-on-surface">Create Restaurant</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-md">
            <p className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wide">
              Restaurant
            </p>
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Name *</label>
              <input
                placeholder="e.g. Tandoori Hut"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Slug *</label>
              <input
                placeholder="e.g. tandoori-hut"
                value={form.slug}
                onChange={(e) =>
                  setField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none"
              />
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                URL: /r/{form.slug || "…"}
              </p>
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Phone</label>
              <input
                placeholder="10-digit mobile"
                value={form.phone}
                onChange={(e) =>
                  setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Address</label>
              <input
                placeholder="Street, city"
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none"
              />
            </div>

            <p className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wide mt-xs">
              Owner Account
            </p>
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Name *</label>
              <input
                placeholder="e.g. Rajesh Sharma"
                value={form.ownerName}
                onChange={(e) => setField("ownerName", e.target.value)}
                className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Email *</label>
              <input
                type="email"
                placeholder="owner@example.com"
                value={form.ownerEmail}
                onChange={(e) => setField("ownerEmail", e.target.value)}
                className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Password *</label>
              <input
                type="password"
                placeholder="Min 8 characters"
                value={form.ownerPassword}
                onChange={(e) => setField("ownerPassword", e.target.value)}
                className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none"
              />
            </div>

            <button
              onClick={create}
              disabled={saving}
              className="flex items-center justify-center gap-xs h-12 rounded-lg bg-primary text-on-primary font-label-bold text-label-bold shadow-level-1 hover:bg-primary-container transition-colors active:translate-y-[2px] disabled:opacity-50 mt-xs"
            >
              {saving ? "Creating…" : "Create Restaurant"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
