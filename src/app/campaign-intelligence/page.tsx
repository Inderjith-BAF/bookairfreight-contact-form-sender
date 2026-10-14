"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Clock,
  RefreshCw,
  Reply,
  Send,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { BlueprintNav } from "@/components/blueprint-nav";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Row = {
  id: string;
  name: string;
  country: string;
  campaign_group: string;
  status: string;
  metrics: any;
};

export default function CampaignIntelligence() {
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [countries, setCountries] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionMsg, setActionMsg] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [syncingCampaignId, setSyncingCampaignId] = useState("");

  const load = useCallback(
    async (t = token) => {
      if (!t) return;
      setBusy(true);
      try {
        const params = new URLSearchParams({ country, group });
        const response = await fetch("/api/campaign-intelligence?" + params, {
          headers: { Authorization: "Bearer " + t },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setRows(data.campaigns || []);
        setTotals(data.totals || {});
        setCountries(data.filters?.countries || []);
        setGroups(data.filters?.groups || []);
      } catch (error) {
        setErr(
          error instanceof Error
            ? error.message
            : "Unable to load intelligence",
        );
      } finally {
        setBusy(false);
      }
    },
    [country, group, token],
  );

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          setToken(data.session.access_token);
          load(data.session.access_token);
        }
      });
  }, [load]);

  const cards = [
    ["Recipients", totals.recipients || 0, Send],
    ["Sent", totals.sent || 0, Send],
    ["Opens", totals.opens || 0, TrendingUp],
    ["Replies", totals.replies || 0, Reply],
    ["Auto Responses", totals.autoResponses || 0, Clock],
    ["Positive", totals.positive || 0, TrendingUp],
    ["Bounces", totals.bounces || 0, ShieldAlert],
  ];

  async function syncCampaignReplies(campaign: Row) {
    if (!token || busy || syncingCampaignId) return;
    setSyncingCampaignId(campaign.id);
    setErr("");
    setActionMsg("");

    try {
      const response = await fetch("/api/mail-merge/sync-replies", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Reply sync failed");
      }
      setActionMsg(
        `Reply sync completed for "${campaign.name}". ${data.message || "Mailbox sync completed."}`,
      );
      await load(token);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Reply sync failed");
    } finally {
      setSyncingCampaignId("");
    }
  }

  async function addSelectedToOutbound() {
    if (!token || !selectedIds.length) return;
    setBusy(true);
    setErr("");
    setActionMsg("");

    try {
      const response = await fetch("/api/campaign-intelligence", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignIds: selectedIds,
          activityDate: activityDate || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "Could not add campaigns to My Outbound",
        );
      }
      setActionMsg(
        data.message || "Selected campaigns added to My Outbound.",
      );
      setSelectedIds([]);
    } catch (error) {
      setErr(
        error instanceof Error
          ? error.message
          : "Could not add campaigns to My Outbound",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="os-page-enter min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 text-slate-900 md:p-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <BlueprintNav />

        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-blue-100 bg-white/85 p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-indigo-500">
              <BarChart3 size={15} /> Outbound performance
            </div>
            <h1 className="mt-2 text-3xl font-black">Campaign Intelligence</h1>
            <p className="mt-1 text-sm text-slate-500">
              Country, campaign group and campaign-level performance with reply
              and suppression outcomes.
            </p>
          </div>
          <button
            onClick={() => load()}
            className="rounded-xl border border-blue-100 p-3 text-indigo-600"
            aria-label="Refresh campaign intelligence"
          >
            {busy ? (
              <RefreshCw className="animate-spin" size={18} />
            ) : (
              <RefreshCw size={18} />
            )}
          </button>
        </header>

        <div className="os-stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map(([label, value, Icon]) => (
            <div
              key={String(label)}
              className="os-card rounded-2xl border border-blue-100 bg-white p-4 shadow-sm transition"
            >
              <Icon size={16} className="text-indigo-500" />
              <div className="os-number mt-2 text-2xl font-black tabular-nums">
                <AnimatedNumber value={Number(value)} />
              </div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="os-filter mb-5 flex flex-wrap gap-3 rounded-2xl border border-blue-100 bg-white p-4">
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="rounded-xl border border-blue-100 p-2.5 text-sm"
          >
            <option value="">All countries</option>
            {countries.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="rounded-xl border border-blue-100 p-2.5 text-sm"
          >
            <option value="">All groups</option>
            {groups.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button
            onClick={() => load()}
            className="os-interactive rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"
          >
            Apply filters
          </button>
        </div>

        {err && (
          <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
            {err}
          </div>
        )}

        <div className="os-section-enter overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-50 p-4">
            <div>
              <div className="font-black text-slate-800">
                Add campaigns to My Outbound
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Uses the actual outreach date by default. Choose a different
                report date if needed.
              </p>
              <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                Report date (optional)
                <input
                  type="date"
                  value={activityDate}
                  onChange={(event) => setActivityDate(event.target.value)}
                  className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm font-normal"
                />
                <span className="font-normal text-slate-400">
                  Leave blank to use the actual outreach date
                </span>
              </label>
            </div>
            <button
              onClick={addSelectedToOutbound}
              disabled={busy || !!syncingCampaignId || !selectedIds.length}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy
                ? "Adding…"
                : "Add selected to My Outbound (" + selectedIds.length + ")"}
            </button>
          </div>

          {actionMsg && (
            <div className="border-b border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
              {actionMsg}
            </div>
          )}

          <div className="overflow-auto">
            <table className="w-full min-w-[1300px] text-left text-sm">
              <thead className="bg-blue-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3">
                    <input
                      aria-label="Select all campaigns"
                      type="checkbox"
                      checked={
                        rows.length > 0 &&
                        rows.every((row) => selectedIds.includes(row.id))
                      }
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked
                            ? rows.map((row) => row.id)
                            : [],
                        )
                      }
                    />
                  </th>
                  {[
                    "Campaign",
                    "Country",
                    "Group",
                    "Status",
                    "Recipients",
                    "Eligible",
                    "Sent",
                    "Opens",
                    "Replies",
                    "Auto Responses",
                    "Positive",
                    "Neutral",
                    "Negative",
                    "Bounces",
                    "Unsub",
                    "Completion",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="whitespace-nowrap p-3 font-black"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="os-row-enter border-t border-blue-50 transition hover:bg-blue-50/50"
                    style={{ animationDelay: `${index * 35}ms` }}
                  >
                    <td className="p-3">
                      <input
                        aria-label={"Select " + row.name}
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={(event) =>
                          setSelectedIds((previous) =>
                            event.target.checked
                              ? [...previous, row.id]
                              : previous.filter((id) => id !== row.id),
                          )
                        }
                      />
                    </td>
                    <td className="p-3 font-bold">{row.name}</td>
                    <td className="p-3">{row.country}</td>
                    <td className="p-3">{row.campaign_group}</td>
                    <td className="p-3">
                      <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3">{row.metrics.recipients}</td>
                    <td className="p-3">{row.metrics.eligible}</td>
                    <td className="p-3">{row.metrics.sent}</td>
                    <td className="p-3">{row.metrics.opens}</td>
                    <td className="p-3">{row.metrics.replies}</td>
                    <td className="p-3 font-semibold text-amber-600">
                      {row.metrics.autoResponses || 0}
                    </td>
                    <td className="p-3 font-bold text-emerald-600">
                      {row.metrics.positive}
                    </td>
                    <td className="p-3">{row.metrics.neutral}</td>
                    <td className="p-3">{row.metrics.negative}</td>
                    <td className="p-3 text-rose-600">{row.metrics.bounces}</td>
                    <td className="p-3">{row.metrics.unsubscribes}</td>
                    <td className="p-3 text-xs text-slate-500">
                      {row.metrics.completion_time
                        ? Math.round(row.metrics.completion_time / 60000) +
                          " min"
                        : "—"}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => syncCampaignReplies(row)}
                        disabled={busy || !!syncingCampaignId}
                        className="whitespace-nowrap rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 disabled:opacity-50"
                      >
                        {syncingCampaignId === row.id
                          ? "Syncing…"
                          : "Sync replies"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="os-empty p-12 text-center text-sm text-slate-400">
                <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-blue-50">
                  <BarChart3 size={17} className="text-indigo-500" />
                </div>
                No campaign data matches these filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
