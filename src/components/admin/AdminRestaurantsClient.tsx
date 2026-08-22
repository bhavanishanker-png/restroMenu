"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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

export function AdminRestaurantsClient({ initialRestaurants }: Props) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(initialRestaurants);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
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
        const { error } = await res.json() as { error: { message: string } };
        toast.error(error?.message ?? "Failed to create restaurant.");
        return;
      }
      const { restaurant } = await res.json() as { restaurant: Restaurant };
      setRestaurants((p) => [restaurant, ...p]);
      setForm({ name: "", slug: "", ownerName: "", ownerEmail: "", ownerPassword: "", phone: "", address: "" });
      setOpen(false);
      toast.success(`${restaurant.name} created.`);
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">{restaurants.length} restaurant{restaurants.length !== 1 ? "s" : ""}</p>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button className="bg-[#C2410C] hover:bg-[#9a3209] text-white">
              <Plus className="mr-1 h-4 w-4" /> New restaurant
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Create restaurant</SheetTitle>
            </SheetHeader>
            <div className="mt-5 flex flex-col gap-4">
              {/* Restaurant info */}
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Restaurant</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r-name">Name *</Label>
                <Input
                  id="r-name"
                  placeholder="e.g. Tandoori Hut"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r-slug">Slug *</Label>
                <Input
                  id="r-slug"
                  placeholder="e.g. tandoori-hut"
                  value={form.slug}
                  onChange={(e) => setField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                />
                <p className="text-xs text-stone-400">URL: /r/{form.slug || "…"}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r-phone">Phone</Label>
                <Input
                  id="r-phone"
                  placeholder="10-digit mobile"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r-address">Address</Label>
                <Input
                  id="r-address"
                  placeholder="Street, city"
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                />
              </div>

              {/* Owner account */}
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Owner account</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="o-name">Name *</Label>
                <Input
                  id="o-name"
                  placeholder="e.g. Rajesh Sharma"
                  value={form.ownerName}
                  onChange={(e) => setField("ownerName", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="o-email">Email *</Label>
                <Input
                  id="o-email"
                  type="email"
                  placeholder="owner@example.com"
                  value={form.ownerEmail}
                  onChange={(e) => setField("ownerEmail", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="o-pw">Password *</Label>
                <Input
                  id="o-pw"
                  type="password"
                  placeholder="Min 8 characters"
                  value={form.ownerPassword}
                  onChange={(e) => setField("ownerPassword", e.target.value)}
                />
              </div>

              <Button
                onClick={create}
                disabled={saving}
                className="mt-2 bg-[#C2410C] hover:bg-[#9a3209] text-white"
              >
                {saving ? "Creating…" : "Create restaurant"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {restaurants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 py-16 text-center text-sm text-stone-400">
          No restaurants yet. Create your first one above.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-medium uppercase tracking-wide text-stone-400">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Slug</th>
                <th className="px-4 py-2.5 hidden sm:table-cell">Plan</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {restaurants.map((r) => (
                <tr key={r.id} className="border-b border-stone-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-stone-800">{r.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-500">{r.slug}</td>
                  <td className="px-4 py-3 text-stone-400 hidden sm:table-cell capitalize">{r.plan}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.isActive ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"}`}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/r/${r.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-stone-400 hover:bg-stone-50 hover:text-stone-600"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
