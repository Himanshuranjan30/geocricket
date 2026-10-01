"use client";

import { Plus, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { siteUrl } from "@/lib/client";
import { countryName, type Profile } from "@/lib/profile";
import { track } from "./Analytics";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import { ProfileSetup, type Account } from "./ProfileSetup";
import { Rank } from "./Rank";

type Me = { profile: Profile | null; user: Account; googleEnabled: boolean; suggestedCountry: string | null };
type Row = { rank: number; handle: string; avatar: string; country: string | null; total: number; days: number; me: boolean };

function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then(setMe, () => {}); }, []);
  return [me, setMe] as const;
}

const inviteText = (name: string, code: string) => `🏏 Join "${name}" on GeoCricket: daily cricket geography, with our own leaderboard. ${siteUrl()}/g/${code}`;

/** /groups: my groups and a form to start one. */
export function GroupsHome() {
  const router = useRouter();
  const [me, setMe] = useMe();
  const [groups, setGroups] = useState<{ code: string; name: string; members: number; owner: boolean }[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const load = useCallback(() => fetch("/api/groups", { cache: "no-store" }).then((r) => r.json()).then((d) => setGroups(d.groups), () => setGroups([])), []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!me?.profile) { setSetup(true); return; }
    setError(null);
    const res = await fetch("/api/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const d = await res.json();
    if (!res.ok) { setError(d.error); return; }
    track("group_created");
    router.push(`/g/${d.code}`);
  }

  return (
    <>
      <form onSubmit={create} className="glass flex flex-col gap-3 rounded-3xl p-4">
        <label htmlFor="gname" className="display text-lg">Start a group</label>
        <p className="text-sm text-muted">For your WhatsApp group, office or college. Everyone plays the same daily round and you get your own leaderboard.</p>
        <div className="flex gap-2">
          <input id="gname" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Office XI"
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-deep/70 px-3 py-3 outline-none focus:border-ok" />
          <button className="btn-primary flex items-center gap-1.5 px-5" disabled={name.trim().length < 2}><Plus weight="bold" size={18} />Create</button>
        </div>
        {error && <p className="text-sm text-[#FF8F9C]">{error}</p>}
      </form>
      <section className="flex flex-col gap-2">
        <h2 className="display text-2xl">Your groups</h2>
        {!groups ? <p className="text-muted">Loading…</p> : groups.length === 0 ? <p className="text-muted">You haven&apos;t joined a group yet. Create one, or open an invite link from a friend.</p> : (
          <ul className="flex flex-col gap-1.5">
            {groups.map((g) => (
              <li key={g.code}>
                <Link href={`/g/${g.code}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 !no-underline hover:bg-white/10">
                  <UsersThree weight="fill" size={24} className="text-ok" />
                  <span className="flex-1 font-semibold !text-cream">{g.name}</span>
                  <span className="text-sm text-muted">{g.members} member{g.members > 1 ? "s" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {setup && me && <ProfileSetup initial={null} suggestedCountry={me.suggestedCountry} user={me.user} googleEnabled={me.googleEnabled} onCancel={() => setSetup(false)} onDone={(profile) => { setMe({ ...me, profile }); setSetup(false); }} />}
    </>
  );
}

/** /g/[code]: a group's leaderboard; join from the invite link. */
export function GroupPage({ code }: { code: string }) {
  const [me, setMe] = useMe();
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [data, setData] = useState<{ group: { code: string; name: string; members: number }; member: boolean; board: { top: Row[]; count: number; me: Row | null } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const load = useCallback(() => fetch(`/api/groups/${code}?period=${period}`, { cache: "no-store" }).then(async (r) => {
    const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d);
  }).catch((e) => setError(e.message)), [code, period]);
  useEffect(() => { load(); }, [load]);

  async function join() {
    if (!me?.profile) { setSetup(true); return; }
    const res = await fetch("/api/groups/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    if (res.ok) { track("group_joined"); load(); }
  }

  if (error) return <p className="text-muted">{error} <Link href="/groups">See your groups</Link></p>;
  if (!data) return <p className="text-muted">Loading…</p>;
  const { group, member, board } = data;
  return (
    <>
      <div className="glass flex flex-col gap-3 rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <UsersThree weight="fill" size={32} className="text-ok" />
          <div className="flex-1"><h2 className="display text-2xl leading-tight">{group.name}</h2><p className="text-sm text-muted">{group.members} member{group.members > 1 ? "s" : ""} · code {group.code}</p></div>
        </div>
        {member ? (
          <a className="display rounded-xl bg-[#1FA855] p-3 text-center text-lg !text-white !no-underline" target="_blank" rel="noopener"
            href={`https://wa.me/?text=${encodeURIComponent(inviteText(group.name, group.code))}`} onClick={() => track("share_clicked", { via: "group_invite" })}>Invite friends on WhatsApp</a>
        ) : (
          <button className="btn-primary py-3.5 text-xl" onClick={join}>Join {group.name}</button>
        )}
        <Link href="/play" className="btn-ghost p-3 text-center font-semibold !text-cream !no-underline">Play today&apos;s round →</Link>
      </div>
      <div className="flex rounded-full border border-white/15 bg-white/5 p-1 self-start" role="tablist">
        {(["day", "week", "month"] as const).map((p) => (
          <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)}
            className={`display rounded-full px-4 py-1.5 text-sm ${period === p ? "bg-white text-deep" : "text-muted"}`}>{p === "day" ? "Today" : p === "week" ? "This week" : "This month"}</button>
        ))}
      </div>
      {board.top.length === 0 ? <p className="text-muted">Nobody in this group has played {period === "day" ? "today" : `this ${period}`} yet.</p> : (
        <ol className="flex flex-col gap-1.5">
          {board.top.map((r) => (
            <li key={r.rank} className={`grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-2xl border px-4 py-2.5 ${r.me ? "border-ok/60 bg-white/15" : "border-white/10 bg-white/5"}`}>
              <Rank n={r.rank} />
              <span className="flex min-w-0 items-center gap-2"><Avatar code={r.avatar} size={30} /><span className="truncate font-medium">@{r.handle}{r.me ? " (you)" : ""}</span><Flag code={r.country} size={12} /></span>
              <span className="text-right"><b className="display text-xl">{r.total.toLocaleString("en-IN")}</b> <span className="text-xs text-muted">{period === "day" ? "" : `${r.days}d`}</span></span>
            </li>
          ))}
        </ol>
      )}
      {me?.profile && !member && <p className="text-xs text-muted">Joining shows your @{me.profile.handle} {me.profile.country ? `(${countryName(me.profile.country)})` : ""} scores to group members.</p>}
      {setup && me && <ProfileSetup initial={null} suggestedCountry={me.suggestedCountry} user={me.user} googleEnabled={me.googleEnabled} onCancel={() => setSetup(false)} onDone={(profile) => { setMe({ ...me, profile }); setSetup(false); setTimeout(join, 0); }} />}
    </>
  );
}
